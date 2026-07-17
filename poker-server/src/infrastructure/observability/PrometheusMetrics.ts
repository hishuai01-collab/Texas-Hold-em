import { createServer, type Server } from 'node:http';
import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

export class PokerMetrics {
  readonly registry = new Registry();
  readonly onlineTables = new Gauge({ name: 'poker_online_tables', help: 'Tables with one or more seated players', registers: [this.registry] });
  readonly activeConnections = new Gauge({ name: 'poker_active_connections', help: 'Authenticated active WebSocket connections', registers: [this.registry] });
  readonly abnormalDisconnects = new Counter({ name: 'poker_abnormal_disconnects_total', help: 'WebSocket closes not initiated as normal client shutdown', registers: [this.registry] });
  readonly actionTimeouts = new Counter({ name: 'poker_action_timeouts_total', help: 'Actions executed by the AFK timeout manager', registers: [this.registry] });
  readonly gatewayRejections = new Counter({ name: 'poker_gateway_rejections_total', help: 'Rejected inbound messages', labelNames: ['reason'] as const, registers: [this.registry] });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'poker_process_' });
  }
}

export function startMetricsServer(metrics: PokerMetrics, port = Number(process.env.METRICS_PORT ?? 9091)): Server {
  const server = createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': metrics.registry.contentType });
    res.end(await metrics.registry.metrics());
  });
  const host = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
  server.listen(port, host);
  return server;
}
