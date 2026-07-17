# 德州核心服务可观测性环境

本目录提供 Redis、Prometheus 和 Grafana 三个运维服务。Grafana 会通过 provisioning 自动配置 Prometheus 数据源并导入 `grafana/dashboards/dashboard.json`。

## 启动

```bash
cd docker
docker compose up -d
```

- Grafana: <http://localhost:3000>，默认账号 `admin` / `admin`
- Prometheus: <http://localhost:9090>
- Redis: `redis://localhost:6379`

启动后，Grafana 首页选择 `德州核心服务 - 运行大盘`。

## 后端连接约定

Prometheus 默认抓取 `host.docker.internal:9091/metrics`，适用于后端在宿主机运行的开发环境。后端需要使用 `REDIS_URL=redis://127.0.0.1:6379` 连接本 Compose 暴露的 Redis。

生产模式下后端的指标服务只监听 `127.0.0.1`，容器无法直接访问该回环地址；部署时应使用宿主机网络或受认证的内部反代暴露 `/metrics`，不要把 9091 直接开放到公网。若目标地址不同，只需修改 `prometheus/prometheus.yml`。

## Dashboard 指标说明

当前后端已存在并直接使用的指标为：

- `poker_active_connections`：在线玩家数
- `poker_online_tables`：活跃桌数
- `poker_abnormal_disconnects_total`：异常断开
- `poker_gateway_rejections_total{reason=...}`：网关拒绝消息

“重连错误率”会优先读取 `poker_reconnect_errors_total` / `poker_reconnect_attempts_total`；“消息吞吐量”会优先读取 `poker_messages_total`。这些全量业务指标当前未在后端埋点中定义，因此 Dashboard 内置了现有指标的明确代理回退，不需要修改任何 TypeScript 文件即可启动大盘。
