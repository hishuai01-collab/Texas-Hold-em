#!/usr/bin/env node

/**
 * 无头压测机器人 —— 模拟大量并发 WebSocket 客户端连接德州扑克服务器。
 *
 * 用法：
 *   NODE_PATH=../poker-server/node_modules node tests/load/load-tester.js
 *   # 或从 poker-server 目录运行：
 *   cd ../poker-server && node ../tests/load/load-tester.js
 *
 * 环境变量：
 *   WS_URL          WebSocket 地址（默认 ws://localhost:8080）
 *   CONCURRENCY     并发连接数（默认 500）
 *   DURATION        压测持续秒数（默认 30）
 *   BOTS_PER_SEC    每秒新建连接数（默认 200，0 表示全并发）
 *   START_DELAY_MS  连接完成后等待多少 ms 再发 START（默认 2000）
 */

let WebSocket;
try {
  WebSocket = require('ws');
} catch {
  // 如果从根目录运行，尝试从 poker-server 目录加载
  const path = require('path');
  const wsPath = path.resolve(__dirname, '../../poker-server/node_modules/ws');
  WebSocket = require(wsPath);
}
const crypto = require('crypto');

// ── 配置 ──────────────────────────────────────────────────────────────
const WS_URL = process.env.WS_URL || 'ws://localhost:8080';
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '500', 10));
const DURATION_SEC = Math.max(5, parseInt(process.env.DURATION || '30', 10));
const BOTS_PER_SEC = parseInt(process.env.BOTS_PER_SEC || '200', 10);
const START_DELAY_MS = parseInt(process.env.START_DELAY_MS || '2000', 10);

// ── 统计计数器 ────────────────────────────────────────────────────────
const stats = {
  totalConnections: 0,
  successfulConnections: 0,
  failedConnections: 0,
  totalActions: 0,
  totalLatencyMs: 0,
  disconnect1008: 0,
  disconnectOther: 0,
  totalEvents: 0,
  errors: 0,
  handsPlayed: 0,
};

let startTime = 0;
let printTimer = null;
let activeBots = new Set();
let dealerWs = null;
let dealerId = null;
let handInProgress = false;

// ── 工具函数 ──────────────────────────────────────────────────────────

function randomId() {
  return crypto.randomUUID().slice(0, 8);
}

function now() {
  return Date.now();
}

function elapsed() {
  return ((now() - startTime) / 1000).toFixed(1);
}

// ── 统计打印 ──────────────────────────────────────────────────────────

function printStats() {
  const uptime = (now() - startTime) / 1000;
  if (uptime <= 0) return;

  const tps = stats.totalActions / uptime;
  const avgLatency = stats.totalActions > 0 ? (stats.totalLatencyMs / stats.totalActions).toFixed(1) : '-';
  const successRate = stats.totalConnections > 0
    ? ((stats.successfulConnections / stats.totalConnections) * 100).toFixed(1)
    : '-';
  const rate1008 = stats.totalConnections > 0
    ? ((stats.disconnect1008 / stats.totalConnections) * 100).toFixed(2)
    : '-';

  console.log([
    `[${elapsed()}s]`,
    `连接 ${stats.successfulConnections}/${stats.totalConnections}`,
    `| 成功率 ${successRate}%`,
    `| 1008断开率 ${rate1008}%`,
    `| TPS ${tps.toFixed(1)}`,
    `| 平均延迟 ${avgLatency}ms`,
    `| 事件 ${stats.totalEvents}`,
    `| 手牌 ${stats.handsPlayed}`,
    `| 在线 ${activeBots.size}`,
  ].join(' '));
}

// ── 单个机器人 ────────────────────────────────────────────────────────

function createBot(index) {
  const botId = `bot-${index}-${randomId()}`;
  const name = `LoadTester#${index}`;
  const clientSeed = crypto.randomBytes(16).toString('hex');
  let clientSeq = 0;
  let playerId = null;
  let connected = false;
  let ws = null;
  let joinTime = 0;
  let actionTimestamps = [];

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ ...payload, clientSeq: clientSeq++ }));
    return true;
  }

  function connect() {
    if (ws) return;
    stats.totalConnections++;
    joinTime = now();

    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      send({ type: 'JOIN', name, clientSeed });
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      stats.totalEvents++;

      switch (msg.type) {
        case 'JOINED':
          playerId = msg.you;
          connected = true;
          stats.successfulConnections++;
          activeBots.add(botId);
          // 第一个连接成功的机器人作为 dealer
          if (!dealerId) {
            dealerId = playerId;
            dealerWs = ws;
          }
          break;

        case 'ERROR':
          stats.errors++;
          break;

        case 'HAND_STARTED':
          handInProgress = true;
          break;

        case 'ACTION_REQUIRED': {
          if (msg.playerId !== playerId) break;
          const latency = now() - joinTime;
          stats.totalLatencyMs += latency;
          stats.totalActions++;
          actionTimestamps.push(now());

          // 随机行动：FOLD 或 CHECK（如果 toCall === 0 则 CHECK，否则 FOLD）
          const action = msg.toCall > 0 ? 'FOLD' : 'CHECK';
          send({ type: 'ACTION', action });
          break;
        }

        case 'ACTION_APPLIED':
          // 行动被确认，无事可做
          break;

        case 'HAND_ENDED':
          stats.handsPlayed++;
          handInProgress = false;
          break;

        case 'SHOWDOWN':
          // 摊牌，等待 HAND_ENDED
          break;

        case 'RECONNECTED':
        case 'EVENT_REPLAY':
          // 重连场景，压测中不常见
          break;
      }
    });

    ws.on('close', (code) => {
      if (code === 1008) stats.disconnect1008++;
      else if (code !== 1000 && code !== 1001) stats.disconnectOther++;
      activeBots.delete(botId);
      if (playerId === dealerId) {
        dealerId = null;
        dealerWs = null;
      }
      ws = null;
      connected = false;
    });

    ws.on('error', () => {
      stats.failedConnections++;
      ws = null;
    });
  }

  function disconnect() {
    if (ws) {
      ws.close(1000, 'load test finished');
      ws = null;
    }
    connected = false;
    activeBots.delete(botId);
  }

  return { connect, disconnect, get id() { return botId; }, get connected() { return connected; } };
}

// ── 主流程 ────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  德州扑克 无头压测机器人');
  console.log(`  目标: ${WS_URL}`);
  console.log(`  并发: ${CONCURRENCY}`);
  console.log(`  持续: ${DURATION_SEC}s`);
  console.log(`  速率: ${BOTS_PER_SEC === 0 ? '全并发' : BOTS_PER_SEC + '/s'}`);
  console.log('══════════════════════════════════════════════');
  console.log('');

  startTime = now();

  // ── 阶段 1：批量建立连接 ──
  console.log(`[${elapsed()}s] 开始建立 ${CONCURRENCY} 个连接...`);

  const bots = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    bots.push(createBot(i + 1));
  }

  if (BOTS_PER_SEC > 0) {
    // 限速连接
    const batchSize = Math.max(1, Math.floor(BOTS_PER_SEC / 10)); // 每 100ms 一批
    for (let i = 0; i < bots.length; i += batchSize) {
      const batch = bots.slice(i, i + batchSize);
      batch.forEach(b => b.connect());
      await new Promise(r => setTimeout(r, 100));
    }
  } else {
    // 全并发
    bots.forEach(b => b.connect());
  }

  // ── 等待连接稳定 ──
  console.log(`[${elapsed()}s] 等待连接稳定...`);
  const waitStart = now();
  while (activeBots.size < CONCURRENCY && now() - waitStart < 15000) {
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`[${elapsed()}s] 已连接 ${activeBots.size} 个机器人`);

  // ── 启动统计打印（每秒） ──
  printTimer = setInterval(printStats, 1000);

  // ── 阶段 2：开始游戏循环 ──
  console.log(`[${elapsed()}s] 等待 ${START_DELAY_MS}ms 后开始第一局...`);
  await new Promise(r => setTimeout(r, START_DELAY_MS));

  // 持续发送 START 开始新对局
  const gameLoop = setInterval(() => {
    if (dealerWs && dealerWs.readyState === WebSocket.OPEN && !handInProgress && activeBots.size >= 2) {
      const seq = 0; // dealer 的 clientSeq 独立维护
      dealerWs.send(JSON.stringify({ type: 'START', clientSeq: seq }));
    }
  }, 500);

  // ── 阶段 3：持续 DURATION_SEC 秒 ──
  await new Promise(r => setTimeout(r, DURATION_SEC * 1000));

  // ── 清理 ──
  clearInterval(gameLoop);
  clearInterval(printTimer);

  console.log('');
  console.log(`[${elapsed()}s] 压测结束，清理连接...`);

  bots.forEach(b => b.disconnect());
  await new Promise(r => setTimeout(r, 1000));

  // ── 最终统计 ──
  const uptime = (now() - startTime) / 1000;
  const tps = stats.totalActions / uptime;
  const avgLatency = stats.totalActions > 0 ? (stats.totalLatencyMs / stats.totalActions).toFixed(1) : '-';
  const successRate = stats.totalConnections > 0
    ? ((stats.successfulConnections / stats.totalConnections) * 100).toFixed(1)
    : '-';
  const rate1008 = stats.totalConnections > 0
    ? ((stats.disconnect1008 / stats.totalConnections) * 100).toFixed(2)
    : '-';

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  压测报告');
  console.log('══════════════════════════════════════════════');
  console.log(`  运行时长          ${uptime.toFixed(1)}s`);
  console.log(`  总连接数          ${stats.totalConnections}`);
  console.log(`  成功连接          ${stats.successfulConnections}`);
  console.log(`  连接成功率        ${successRate}%`);
  console.log(`  1008 断开率       ${rate1008}%`);
  console.log(`  其他异常断开      ${stats.disconnectOther}`);
  console.log(`  总行动数          ${stats.totalActions}`);
  console.log(`  吞吐量 (TPS)      ${tps.toFixed(1)}`);
  console.log(`  平均响应延迟      ${avgLatency}ms`);
  console.log(`  总事件数          ${stats.totalEvents}`);
  console.log(`  完成手牌数        ${stats.handsPlayed}`);
  console.log(`  服务端错误数      ${stats.errors}`);
  console.log('══════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('压测异常退出:', err);
  process.exit(1);
});