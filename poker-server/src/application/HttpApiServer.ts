import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { privateTableService } from './PrivateTableService.js';
import { TableManager } from './TableManager.js';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) ?? ['*'];

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] === '*' ? '*' : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export interface HttpApiDeps {
  tableManager: TableManager;
}

/**
 * 轻量 HTTP API 服务，与 WebSocket 服务同进程运行。
 * 提供 REST 接口用于创建私人牌桌和获取大厅列表。
 */
export class HttpApiServer {
  private server = createServer((req, res) => this.handleRequest(req, res));

  constructor(private readonly deps: HttpApiDeps) {}

  listen(port: number, host?: string): void {
    this.server.listen(port, host ?? '127.0.0.1', () => {
      console.log(`[HTTP API] listening on http://${host ?? '127.0.0.1'}:${port}`);
    });
  }

  close(): Promise<void> {
    return new Promise(resolve => this.server.close(() => resolve()));
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    try {
      // POST /api/v1/tables/create — 创建私人牌桌
      if (method === 'POST' && url === '/api/v1/tables/create') {
        await this.handleCreateTable(req, res);
        return;
      }

      // GET /api/v1/tables — 获取大厅列表（过滤掉私人桌）
      if (method === 'GET' && url === '/api/v1/tables') {
        await this.handleListTables(res);
        return;
      }

      // GET /api/v1/tables/private/:slug — 查询私人桌信息（用于前端路由 /t/:slug 跳转前校验）
      const privateMatch = url.match(/^\/api\/v1\/tables\/private\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && privateMatch) {
        await this.handleGetPrivateTable(privateMatch[1], res);
        return;
      }

      jsonResponse(res, 404, { error: 'NOT_FOUND', message: '接口不存在' });
    } catch (error) {
      console.error('[HTTP API] error', error);
      jsonResponse(res, 500, { error: 'INTERNAL_ERROR', message: '服务器内部错误' });
    }
  }

  private async handleCreateTable(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = await parseBody(req);
    } catch {
      jsonResponse(res, 400, { error: 'INVALID_JSON', message: '请求体必须是合法的 JSON' });
      return;
    }

    const { tableId, displayName, createdBy } = body as Record<string, unknown>;
    if (!tableId || typeof tableId !== 'string' || tableId.trim().length === 0) {
      jsonResponse(res, 400, { error: 'MISSING_TABLE_ID', message: 'tableId 是必填字段' });
      return;
    }

    const tid = tableId.trim();
    // 校验 tableId 格式（与 WebSocket 握手层一致）
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tid)) {
      jsonResponse(res, 400, { error: 'INVALID_TABLE_ID', message: 'tableId 格式不合法（1-64位字母/数字/下划线/连字符）' });
      return;
    }

    // 预热创建桌子（如果尚未存在）
    try {
      await this.deps.tableManager.getOrCreate(tid);
    } catch (error) {
      console.error(`[HTTP API] failed to create table ${tid}`, error);
      jsonResponse(res, 500, { error: 'TABLE_CREATE_FAILED', message: '牌桌创建失败' });
      return;
    }

    const meta = privateTableService.create(
      tid,
      typeof displayName === 'string' ? displayName : undefined,
      typeof createdBy === 'string' ? createdBy : undefined,
    );

    console.info(JSON.stringify({
      type: 'PRIVATE_TABLE_CREATED',
      slug: meta.slug,
      tableId: meta.tableId,
      displayName: meta.displayName,
      at: new Date().toISOString(),
    }));

    jsonResponse(res, 201, {
      slug: meta.slug,
      tableId: meta.tableId,
      displayName: meta.displayName,
      inviteUrl: `/t/${meta.slug}`,
      createdAt: meta.createdAt,
    });
  }

  private async handleListTables(res: ServerResponse): Promise<void> {
    const tables: Array<{
      id: string;
      smallBlind: number;
      bigBlind: number;
      players: number;
      maxPlayers: number;
      status: 'OPEN' | 'FULL' | 'RUNNING';
    }> = [];

    // 遍历 TableManager 中所有活跃桌子，过滤掉私人桌
    for (const [tableId, session] of this.deps.tableManager.entries()) {
      // 跳过私人桌
      if (privateTableService.isPrivate(tableId)) continue;

      const seatCount = session.engine.seats.length;
      const maxPlayers = 6; // 固定最大人数
      const handInProgress = session.engine.handInProgress;

      let status: 'OPEN' | 'FULL' | 'RUNNING';
      if (seatCount >= maxPlayers) {
        status = 'FULL';
      } else if (handInProgress) {
        status = 'RUNNING';
      } else {
        status = 'OPEN';
      }

      tables.push({
        id: tableId,
        smallBlind: 5,
        bigBlind: 10,
        players: seatCount,
        maxPlayers,
        status,
      });
    }

    jsonResponse(res, 200, { tables });
  }

  private async handleGetPrivateTable(slug: string, res: ServerResponse): Promise<void> {
    const meta = privateTableService.findBySlug(slug);
    if (!meta) {
      jsonResponse(res, 404, { error: 'NOT_FOUND', message: '私人牌桌不存在或已过期' });
      return;
    }

    jsonResponse(res, 200, {
      slug: meta.slug,
      tableId: meta.tableId,
      displayName: meta.displayName,
      createdAt: meta.createdAt,
    });
  }
}