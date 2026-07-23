import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpApiServer } from '../src/application/HttpApiServer.js';
import { TableManager } from '../src/application/TableManager.js';
import { InMemoryEventStore } from '../src/infrastructure/eventstore/EventStore.js';
import { InMemoryTableRegistry } from '../src/infrastructure/registry/TableRegistry.js';
import { PokerMetrics } from '../src/infrastructure/observability/PrometheusMetrics.js';

function listen(api: HttpApiServer): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise(resolve => {
    const server: any = (api as any).server;
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ port, close: () => api.close() });
    });
  });
}

async function request(port: number, path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const http = await import('node:http');
  return new Promise((resolve, reject) => {
    const opts: any = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers,
    };
    if (body && method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }
    const clientReq = http.request(opts, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: raw });
        }
      });
    });
    clientReq.on('error', reject);
    if (body) clientReq.write(JSON.stringify(body));
    clientReq.end();
  });
}

test('HTTP API：/healthz 返回 200', async () => {
  const eventStore = new InMemoryEventStore();
  const registry = new InMemoryTableRegistry();
  const metrics = new PokerMetrics();
  const manager = new TableManager({ eventStore, registry, metrics });
  const api = new HttpApiServer({ tableManager: manager });
  const { port, close } = await listen(api);

  const res = await request(port, '/healthz');
  assert.equal(res.status, 200);
  assert.equal((res.body as any).status, 'ok');

  await close();
});

test('HTTP API：/api/v1/user/me 无 userId 返回 400', async () => {
  const api = new HttpApiServer({
    tableManager: new TableManager({ eventStore: new InMemoryEventStore(), registry: new InMemoryTableRegistry(), metrics: new PokerMetrics() }),
  });
  const { port, close } = await listen(api);

  const res = await request(port, '/api/v1/user/me');
  assert.equal(res.status, 400);
  assert.equal((res.body as any).error, 'MISSING_FIELD');

  await close();
});

test('HTTP API：/api/v1/users/register 无 Redis 返回 501', async () => {
  const api = new HttpApiServer({
    tableManager: new TableManager({ eventStore: new InMemoryEventStore(), registry: new InMemoryTableRegistry(), metrics: new PokerMetrics() }),
  });
  const { port, close } = await listen(api);

  const res = await request(port, '/api/v1/users/register', 'POST', { name: 'Alice' });
  assert.equal(res.status, 501);
  assert.equal((res.body as any).error, 'REDIS_UNAVAILABLE');

  await close();
});

test('HTTP API：/api/v1/tables 未知路径返回 404 且带 traceId', async () => {
  const eventStore = new InMemoryEventStore();
  const registry = new InMemoryTableRegistry();
  const metrics = new PokerMetrics();
  const manager = new TableManager({ eventStore, registry, metrics });
  const api = new HttpApiServer({ tableManager: manager });
  const { port, close } = await listen(api);

  const res = await request(port, '/api/v1/nope');
  assert.equal(res.status, 404);
  assert.ok((res.body as any).traceId, '404 响应应携带 traceId');

  await close();
});

test('HTTP API：/api/v1/auth/login 无 Redis 返回 501', async () => {
  const api = new HttpApiServer({
    tableManager: new TableManager({ eventStore: new InMemoryEventStore(), registry: new InMemoryTableRegistry(), metrics: new PokerMetrics() }),
  });
  const { port, close } = await listen(api);

  const res = await request(port, '/api/v1/auth/login', 'POST', { name: 'Alice' });
  assert.equal(res.status, 501);
  assert.equal((res.body as any).error, 'REDIS_UNAVAILABLE');

  await close();
});

const redisUrl = process.env.REDIS_URL;
const authIntegrationSkip = !redisUrl ? 'REDIS_URL not configured; skipping auth integration coverage' : false;

test('HTTP API：登录颁发 Bearer token，/user/me 使用 token 获取完整资料', { skip: authIntegrationSkip }, async () => {
  const api = new HttpApiServer({
    tableManager: new TableManager({ eventStore: new InMemoryEventStore(), registry: new InMemoryTableRegistry(), metrics: new PokerMetrics() }),
    redisUrl: redisUrl!,
  });
  const { port, close } = await listen(api);

  const login = await request(port, '/api/v1/auth/login', 'POST', { name: 'Auth Integration' });
  assert.equal(login.status, 200);
  const token = String((login.body as { token?: string }).token);
  assert.ok(token.length > 32, 'login should return a durable bearer token');

  const me = await request(port, '/api/v1/user/me', 'GET', undefined, { Authorization: `Bearer ${token}` });
  assert.equal(me.status, 200);
  assert.equal((me.body as { name: string }).name, 'Auth Integration');
  assert.equal((me.body as { balance: number }).balance, 1000);

  await close();
});

test('HTTP API：私桌 capability 解析必须有效且不暴露创建响应中的 tableId', async () => {
  const manager = new TableManager({ eventStore: new InMemoryEventStore(), registry: new InMemoryTableRegistry(), metrics: new PokerMetrics() });
  const api = new HttpApiServer({ tableManager: manager });
  const { port, close } = await listen(api);

  const created = await request(port, '/api/v1/tables/create', 'POST', { displayName: '仅邀请', maxUses: 2, ttlSeconds: 3600 });
  assert.equal(created.status, 201);
  assert.equal('tableId' in (created.body as Record<string, unknown>), false);
  const capability = String((created.body as { inviteUrl: string }).inviteUrl).split('/').at(-1)!;
  const revokeCapability = String((created.body as { revokeCapability: string }).revokeCapability);
  assert.match(capability, /^[A-Za-z0-9_-]{43}$/);

  const resolved = await request(port, `/api/v1/tables/private/${capability}`);
  assert.equal(resolved.status, 200);
  assert.match(String((resolved.body as { tableId: string }).tableId), /^private-/);

  const invalid = await request(port, `/api/v1/tables/private/${capability.slice(0, -1)}x`);
  assert.equal(invalid.status, 404);

  const unauthorizedRevoke = await request(port, `/api/v1/tables/private/${capability}`, 'DELETE');
  assert.equal(unauthorizedRevoke.status, 404);
  const revoked = await request(port, `/api/v1/tables/private/${capability}`, 'DELETE', undefined, { 'X-Private-Invite-Revoke': revokeCapability });
  assert.equal(revoked.status, 200);
  const afterRevoke = await request(port, `/api/v1/tables/private/${capability}`);
  assert.equal(afterRevoke.status, 404);

  await close();
});
