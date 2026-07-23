import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { TableManager } from "./application/TableManager.js";
import { HttpApiServer } from "./application/HttpApiServer.js";
import type { TableSession } from "./application/TableSession.js";
import type { ClientMsg, ServerMsg } from "./shared/protocol.js";
import {
  MAX_MESSAGE_BYTES,
  WebSocketGateway,
} from "./infrastructure/security/WebSocketGateway.js";
import {
  IpBlocklist,
  extractClientIp,
} from "./infrastructure/security/IpBlocklist.js";
import {
  guardAction,
  type ConnectionState,
} from "./infrastructure/security/ConnectionState.js";
import { precheckAction } from "./infrastructure/security/ActionPrecheck.js";
import { verifyActionSignature } from "./infrastructure/security/ActionRiskControl.js";
import { clientMsgSchema } from "./infrastructure/security/schema.js";
import { createReconnectTokenStore } from "./infrastructure/reconnect/RedisReconnectTokenStore.js";
import {
  PokerMetrics,
  startMetricsServer,
} from "./infrastructure/observability/PrometheusMetrics.js";
import { TelegramNotifier } from "./infrastructure/observability/TelegramNotifier.js";
import {
  TelegramAdminBot,
  type AdminBotDependencies,
} from "./infrastructure/observability/TelegramAdminBot.js";
import { createEventStore } from "./infrastructure/eventstore/RedisEventStore.js";
import { createTableRegistry } from "./infrastructure/registry/TableRegistry.js";
import { privateTableService } from "./application/PrivateTableService.js";

/** IP 动态拉黑：单连接触发 N 次违规后压入 LRU，60s HTTP 层 403 拒绝（防 DoS/防刷）。全局，跨所有桌共享。 */
const BAN_TTL_MS = Number(process.env.IP_BAN_TTL_MS ?? 60_000);
const STRIKES_TO_BAN = Number(process.env.IP_STRIKES_TO_BAN ?? 3);
const blocklist = new IpBlocklist({
  strikesToBan: STRIKES_TO_BAN,
  banTtlMs: BAN_TTL_MS,
  capacity: 10_000,
});

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
  authId: string | null;
  gateway: WebSocketGateway;
  /** 连接状态机：CONNECTING → AUTHORIZING → CONNECTED */
  connState: ConnectionState;
  /** 该连接对应的真实客户端 IP（取自 X-Forwarded-For） */
  clientIp: string;
  /** 该连接绑定的桌（握手时由 URL ?tableId= 解析，缺省为 'default'） */
  tableId: string;
  /** Opaque private-table capability from the invite URL. Never log or persist it. */
  inviteCapability: string | null;
}

/** 向前端发送统一结构化错误（code 枚举 + 用户语言文案 + traceId，绝不暴露后端字段/栈） */
function sendError(
  ext: ExtWebSocket,
  code: string | undefined,
  message: string,
): void {
  if (ext.readyState === WebSocket.OPEN) {
    ext.send(
      JSON.stringify({ type: "ERROR", code, message, traceId: randomUUID() } satisfies ServerMsg),
    );
  }
}

const DEFAULT_TABLE_ID = "default";
const TABLE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** Parse the public table identifier and an optional opaque private-table capability. */
function parseTableConnection(url: string | undefined): { tableId: string; inviteCapability: string | null } {
  if (!url) return { tableId: DEFAULT_TABLE_ID, inviteCapability: null };
  try {
    const parsed = new URL(url, "http://internal");
    const raw = parsed.searchParams.get("tableId");
    const invite = parsed.searchParams.get("invite");
    if (raw && TABLE_ID_PATTERN.test(raw)) {
      return { tableId: raw, inviteCapability: invite && /^[A-Za-z0-9_-]{43,128}$/.test(invite) ? invite : null };
    }
  } catch {
    /* 畸形 URL：回落默认桌 */
  }
  return { tableId: DEFAULT_TABLE_ID, inviteCapability: null };
}

const PORT = Number(process.env.PORT ?? 8080);
const HTTP_API_PORT = Number(process.env.HTTP_API_PORT ?? 8081);
const HOST = process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0";
const BOTS = Number(process.env.BOTS ?? 0); // 仅用于 default 桌的本地/演示联调
let acceptingConnections = true;
let shuttingDown = false;

const metrics = new PokerMetrics();
const reconnectTokens = createReconnectTokenStore();
const eventStore = createEventStore();
const tableRegistry = createTableRegistry();
const tableManager = new TableManager({
  eventStore,
  registry: tableRegistry,
  metrics,
});

function refreshConnectionGauge(): void {
  metrics.activeConnections.set(tableManager.totalSockets());
}

/** Ignore a late close from a replaced reconnect socket. */
function cleanupPlayer(
  authId: string | null,
  ws: ExtWebSocket,
  session: TableSession,
): void {
  if (!authId || session.sockets.get(authId) !== ws) return;
  session.sockets.delete(authId);
  session.timeoutManager.markDisconnected(authId);
  session.runCommand(() => {
    if (!session.engine.handInProgress) session.engine.removePlayer(authId);
  });
  refreshConnectionGauge();
  tableManager.refreshOnlineTablesGauge();
}

async function main(): Promise<void> {
  // 预热：'default' 桌始终立即可用（含演示用 BOTS），此外把上次进程存活时注册过的其它
  // 桌也一并冷启动重建（快照 + 增量事件流校验），使重启后无需等第一个连接才触发恢复。
  await tableManager.getOrCreate(DEFAULT_TABLE_ID, { seedBots: BOTS });
  const knownTableIds = await tableRegistry.listActive().catch((error) => {
    console.error(
      "[bootstrap] table registry listActive failed (continuing with only the default table)",
      error,
    );
    return [] as string[];
  });
  for (const tableId of knownTableIds) {
    if (tableId === DEFAULT_TABLE_ID) continue;
    try {
      await tableManager.getOrCreate(tableId);
    } catch (error) {
      console.error(
        `[bootstrap] warm-up failed for table ${tableId} (will hydrate lazily on first connection)`,
        error,
      );
    }
  }

const ALLOWED_WS_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean)
);

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin || ALLOWED_WS_ORIGINS.has('*')) return true;
  return ALLOWED_WS_ORIGINS.has(origin);
}

const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
  maxPayload: MAX_MESSAGE_BYTES,
  // 握手层拦截：被拉黑的 IP 直接 403 拒绝升级（防 DoS / 防刷）。
  // 仅对 /ws 这个 WS 升级请求生效；X-Forwarded-For 已由 Nginx 透传可信。
  verifyClient: (info: { req: IncomingMessage }, cb) => {
    const ip = extractClientIp(
      info.req.headers["x-forwarded-for"] as string | undefined,
      info.req.socket.remoteAddress,
    );
    if (blocklist.isBlocked(ip)) {
      cb(
        false,
        403,
        "Forbidden: your IP is temporarily blocked due to suspicious activity",
      );
      console.warn(
        JSON.stringify({
          type: "WSS_HANDSHAKE_BLOCKED",
          ip,
          at: new Date().toISOString(),
        }),
      );
      return;
    }

    const origin = info.req.headers.origin as string | undefined;
    if (!isOriginAllowed(origin)) {
      cb(false, 403, `Forbidden: origin ${origin} not allowed`);
      console.warn(
        JSON.stringify({
          type: "WSS_ORIGIN_REJECTED",
          origin,
          ip,
          at: new Date().toISOString(),
        }),
      );
      return;
    }
      cb(true);
    },
  });

  wss.on("connection", (ws, req) => {
    const ext = ws as ExtWebSocket;
    if (!acceptingConnections) {
      ext.close(1012, "server shutting down");
      return;
    }
    ext.isAlive = true;
    ext.authId = null;
    ext.connState = "CONNECTING";
    const requestedTable = parseTableConnection(req.url);
    ext.tableId = requestedTable.tableId;
    ext.inviteCapability = requestedTable.inviteCapability;
    ext.clientIp = extractClientIp(
      req.headers["x-forwarded-for"] as string | undefined,
      req.socket.remoteAddress,
    );
    ext.gateway = new WebSocketGateway((event) => {
      metrics.gatewayRejections.inc({ reason: event.reason });
      const bannedUntil = blocklist.strike(ext.clientIp);
      console.warn(
        JSON.stringify({
          ...event,
          ip: ext.clientIp,
          tableId: ext.tableId,
          banned: bannedUntil !== null,
          at: new Date().toISOString(),
        }),
      );
    });
    ext.on("pong", () => {
      ext.isAlive = true;
    });

    // 多桌动态路由：同一时刻只会有一个 hydrate 在途（TableManager 内部按 tableId 去重）。
    // 冷启动可能涉及一次 Redis 往返；在此期间到达的消息先排队，hydrate 完成后按到达顺序补处理，
    // 保证不丢消息、不乱序。
    let session: TableSession | undefined;
    let ready = false;
    const pendingRaw: unknown[] = [];

    const handleMessage = (raw: unknown): void => {
      const s = session!;
      const inspected = ext.gateway.inspect(raw);
      if (!inspected.ok) {
        if (inspected.disconnect)
          ext.close(1008, "protocol violations exceeded");
        else
          sendError(
            ext,
            "PROTOCOL_VIOLATION",
            `协议安全校验失败: ${inspected.reason}`,
          );
        return;
      }
      // 运行时 Schema 强校验（Zod，第二道独立防线）：非法载荷直接丢弃并计入违规。
      const parsed = clientMsgSchema.safeParse(inspected.message);
      if (!parsed.success) {
        const bannedUntil = blocklist.strike(ext.clientIp);
        console.warn(
          JSON.stringify({
            type: "WSS_SECURITY_REJECTED",
            reason: "SCHEMA_INVALID",
            violations: -1,
            disconnect: false,
            ip: ext.clientIp,
            banned: bannedUntil !== null,
            issue: parsed.error.issues[0]?.message,
            at: new Date().toISOString(),
          }),
        );
        sendError(ext, "SCHEMA_INVALID", "消息格式不合法");
        return;
      }
      const msg: ClientMsg = parsed.data;

      // 连接状态机：未进入 CONNECTED 前拦截 ACTION/START 等业务指令。
      const guard = guardAction(ext.connState, msg.type);
      if (guard) {
        sendError(ext, guard.code, guard.message);
        return;
      }

      if (!s.actor.isHealthy) {
        sendError(ext, "TABLE_UNAVAILABLE", "牌桌暂不可用，请稍后重试");
        return;
      }

      switch (msg.type) {
        case "JOIN": {
          if (ext.authId || ext.connState !== "CONNECTING") {
            sendError(ext, "NOT_AUTHORIZED", "连接正在认证或已入座，不能重复加入");
            break;
          }
          // This synchronous state change fences duplicate JOIN frames before the actor runs.
          ext.connState = "AUTHORIZING";
          const id = randomUUID();
          s.runCommand(() => {
            let inviteConsumed = false;
            if (privateTableService.isPrivate(ext.tableId)) {
              const admission = privateTableService.consumeForJoin(ext.tableId, ext.inviteCapability);
              if (!admission.ok) {
                ext.connState = "CONNECTING";
                sendError(ext, "NOT_AUTHORIZED", "私人牌桌邀请无效、已过期或已失效");
                return;
              }
              inviteConsumed = true;
            }
            try {
              s.engine.addPlayer(id, msg.name, msg.clientSeed);
            } catch (error) {
              if (inviteConsumed) privateTableService.releaseJoin(ext.tableId, ext.inviteCapability);
              ext.connState = "CONNECTING";
              sendError(ext, undefined, (error as Error).message);
              return;
            }
            ext.authId = id;
            ext.connState = "CONNECTED";
            s.sockets.set(id, ext);
            s.timeoutManager.markConnected(id);
            refreshConnectionGauge();
            tableManager.refreshOnlineTablesGauge();
            s.broadcastSessionEvent({
              type: "PLAYER_JOINED",
              seq: 0,
              seats: s.engine.views(),
            });
            void reconnectTokens
              .issue({ playerId: id, tableId: ext.tableId })
              .then((token) => {
                if (ext.readyState === WebSocket.OPEN && ext.authId === id) {
                  ext.send(
                    JSON.stringify({
                      type: "JOINED",
                      seq: 0,
                      you: id,
                      reconnectToken: token,
                      seats: s.engine.views(),
                    } satisfies ServerMsg),
                  );
                }
              })
               .catch((error) => {
                 console.error("[reconnect] token issue failed", error);
                 ext.send(
                   JSON.stringify({
                     type: "ERROR",
                     message: "重连令牌签发失败",
                     traceId: randomUUID(),
                   } satisfies ServerMsg),
                 );
               });
          });
          break;
        }
        case "LEAVE": {
          const id = ext.authId;
          if (!id) {
            sendError(ext, undefined, "尚未入座");
            break;
          }
          s.runCommand(() => {
            try {
              s.engine.removePlayer(id);
            } catch (error) {
              sendError(ext, undefined, (error as Error).message);
              return;
            }
            s.sockets.delete(id);
            s.timeoutManager.clear(id);
            ext.authId = null;
            refreshConnectionGauge();
            tableManager.refreshOnlineTablesGauge();
            s.broadcastSessionEvent({
              type: "PLAYER_LEFT",
              seq: 0,
              playerId: id,
              reason: "LEFT",
              seats: s.engine.views(),
            });
          });
          break;
        }
        case "START":
          s.runCommand(() => {
            try {
              s.engine.startHand();
            } catch (error) {
              sendError(ext, undefined, (error as Error).message);
            }
          });
          break;
        case "ACTION": {
          const id = ext.authId;
          if (!id) {
            sendError(ext, "NOT_AUTHORIZED", "连接未认证");
            break;
          }
          const seat = s.engine.seats.find((p) => p.id === id);
          const isActive = s.engine.activePlayer === id;
          const toCall = seat
            ? s.engine.currentBetAmount - seat.betThisStreet
            : 0;

          const pre = precheckAction({
            handInProgress: s.engine.handInProgress,
            isActivePlayer: isActive,
            action: msg.action,
            amount: msg.amount ?? 0,
            toCall,
            playerChips: seat?.chips ?? 0,
            playerBetThisStreet: seat?.betThisStreet ?? 0,
            currentBet: s.engine.currentBetAmount,
          });
          if (pre.error) {
            sendError(ext, pre.error.code, pre.error.message);
            break;
          }

          if (
            !verifyActionSignature(
              {
                playerId: id,
                clientSeq: msg.clientSeq,
                action: msg.action,
                amount: msg.amount ?? 0,
                tableEpoch: s.tableEpoch,
              },
              s.tableEpoch,
              (msg as ClientMsg & { sig?: string }).sig,
            )
          ) {
            console.warn(
              JSON.stringify({
                type: "ACTION_SIG_REJECTED",
                tableId: s.tableId,
                playerId: id,
                at: new Date().toISOString(),
              }),
            );
            sendError(ext, "ACTION_SIG_INVALID", "动作签名校验失败");
            break;
          }

          s.runCommand(() => {
            try {
              s.engine.act(id, msg.action, msg.amount ?? 0);
            } catch (error) {
              sendError(ext, undefined, (error as Error).message);
            }
          });
          break;
        }
        case "RECONNECT": {
          // Redis I/O 是异步的：鉴权完成后再入队一次状态检查，保证引擎仍是唯一写者。
          void reconnectTokens
            .consume(msg.reconnectToken)
            .then(async (record) =>
              s.runCommand(async () => {
                if (
                  !record ||
                  record.playerId !== msg.playerId ||
                  record.tableId !== s.tableId ||
                  !s.engine.seats.some((p) => p.id === msg.playerId)
                ) {
                   ext.send(
                     JSON.stringify({
                       type: "ERROR",
                       message: "重连校验失败",
                       traceId: randomUUID(),
                     } satisfies ServerMsg),
                   );
                  return;
                }
                const previous = s.sockets.get(msg.playerId);
                if (previous && previous !== ext)
                  previous.close(1012, "replaced by reconnect");
                ext.authId = msg.playerId;
                ext.connState = "CONNECTED";
                s.sockets.set(msg.playerId, ext);
                s.timeoutManager.markConnected(msg.playerId);
                refreshConnectionGauge();
                const events = await s.getReplayFor(msg.playerId, msg.lastSeq);
                ext.send(
                  JSON.stringify({
                    type: "EVENT_REPLAY",
                    events,
                  } satisfies ServerMsg),
                );
                void reconnectTokens
                  .issue({ playerId: msg.playerId, tableId: s.tableId })
                  .then((token) => {
                    if (
                      ext.readyState === WebSocket.OPEN &&
                      ext.authId === msg.playerId
                    ) {
                      ext.send(
                        JSON.stringify({
                          type: "RECONNECTED",
                          seq: 0,
                          reconnectToken: token,
                          seats: s.engine.views(),
                        } satisfies ServerMsg),
                      );
                    }
                  });
              }),
            )
             .catch((error) => {
               console.error("[reconnect] token consume failed", error);
               ext.send(
                 JSON.stringify({
                   type: "ERROR",
                   message: "重连服务不可用",
                   traceId: randomUUID(),
                 } satisfies ServerMsg),
               );
             });
          break;
        }
      }
    };

    tableManager
      .getOrCreate(ext.tableId)
      .then((s) => {
        session = s;
        ready = true;
        for (const raw of pendingRaw) handleMessage(raw);
        pendingRaw.length = 0;
      })
      .catch((error) => {
        console.error(`[table] hydrate failed for ${ext.tableId}`, error);
        sendError(ext, "TABLE_UNAVAILABLE", "牌桌初始化失败，请稍后重试");
        ext.close(1011, "table hydrate failed");
      });

    ext.on("message", (raw) => {
      if (!ready) {
        pendingRaw.push(raw);
        return;
      }
      handleMessage(raw);
    });
    ext.on("close", (code) => {
      if (code !== 1000 && code !== 1001) metrics.abnormalDisconnects.inc();
      if (session) cleanupPlayer(ext.authId, ext, session);
    });
    ext.on("error", (error) => {
      console.warn(
        JSON.stringify({
          type: "WSS_SOCKET_ERROR",
          message: error.message,
          at: new Date().toISOString(),
        }),
      );
      ext.terminate();
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      const c = client as ExtWebSocket;
      if (c.isAlive === false) {
        c.terminate();
        return;
      }
      c.isAlive = false;
      try {
        c.ping();
      } catch {
        c.terminate();
      }
    });
  }, 15_000);

  const metricsServer = startMetricsServer(metrics);

  // 启动 HTTP API 服务（私人牌桌创建 + 大厅列表）
  const httpApi = new HttpApiServer({ tableManager, redisUrl: process.env.REDIS_URL });
  httpApi.listen(HTTP_API_PORT, HOST);

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    acceptingConnections = false;
    console.info(JSON.stringify({ type: "GRACEFUL_SHUTDOWN_STARTED", signal }));
    clearInterval(heartbeat);
    wss.close(); // stop accepting immediately
    for (const socket of wss.clients)
      socket.close(1001, "server shutting down");
    try {
      await httpApi.close();
      await tableManager.shutdownAll(); // 逐桌 drain 队列 + 落一次兜底快照（含进行中手牌的完整状态）
      await reconnectTokens.close();
      await eventStore.close();
      await tableRegistry.close();
      await new Promise<void>((resolve) =>
        metricsServer.close(() => resolve()),
      );
      console.info(JSON.stringify({ type: "GRACEFUL_SHUTDOWN_COMPLETED" }));
      process.exit(0);
    } catch (error) {
      console.error("[shutdown] failed", error);
      process.exit(1);
    }
  }

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  console.log(
    `poker server on http://${HOST}:${PORT}  HTTP API on http://${HOST}:${HTTP_API_PORT}  metrics on ${process.env.METRICS_PORT ?? 9091}  (BOTS=${BOTS}, tables=${tableManager.size})`,
  );

  const adminTgToken = process.env.TG_BOT_TOKEN;
  const adminTgId = process.env.ADMIN_TG_ID;
  if (adminTgToken && adminTgId) {
    const adminBotDeps: AdminBotDependencies = {
      blocklist,
      tableCount: () => tableManager.size,
      connectionCount: () => tableManager.totalSockets(),
    };
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const { Redis } = await import("ioredis");
        const r = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        });
        await r.connect();
        adminBotDeps.redisPing = () => r.ping();
      } catch {
        // Redis 不可用时 /health 降级为仅 WS 状态
      }
    }
    void TelegramAdminBot.startAdminBot({
      botToken: adminTgToken,
      adminTgId,
      deps: adminBotDeps,
    });
  }
}

void main().catch((error) => {
  console.error("[bootstrap] fatal", error);
  process.exit(1);
});
