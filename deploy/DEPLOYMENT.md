# 生产部署说明

本仓库的 Git 根目录包含同级的后端目录 `poker-server/` 与 Vite 客户端目录
`client/`。工作流会构建两者，并将产物分别发布到：

| 产物 | 服务器目标目录 |
| --- | --- |
| `client/dist/` | `/var/www/poker-client/dist/` |
| `poker-server/dist/` | `/var/www/poker-server/dist/` |

## 一次性服务器准备

先将首个已构建版本（`dist/`、`package.json`、`package-lock.json` 与
`ecosystem.config.js`）放入 `/var/www/poker-server/`；可通过部署用户克隆仓库后
构建，或按工作流的 `rsync` 命令手动上传。再以部署用户执行以下命令。该用户必须拥有
两个 `/var/www` 目录及 `/var/log/poker-server` 的写权限，并能运行 `pm2`：

```bash
sudo mkdir -p /var/www/poker-server/dist /var/www/poker-client/dist /var/log/poker-server /var/lib/poker-server /etc/poker-server
sudo chown -R deploy:deploy /var/www/poker-server /var/www/poker-client /var/log/poker-server /var/lib/poker-server
sudo sh -c 'printf "%s\\n" "REDIS_URL=redis://:replace-me@127.0.0.1:6379/0" > /etc/poker-server/env'
sudo chown root:deploy /etc/poker-server/env
sudo chmod 640 /etc/poker-server/env
cd /var/www/poker-server
npm ci --omit=dev
pm2 start ecosystem.config.js --only poker-server
pm2 save
pm2 startup
```

`/etc/poker-server/env` 是仅服务器保存的运行时密钥文件，必须包含 `REDIS_URL`；不要将它
写入仓库或 GitHub Actions。生产进程拒绝在缺少 Redis 的情况下启动。重连令牌保存在
`poker:reconnect:<token>`，TTL 固定为 300 秒，值包含 `{ playerId, tableId }`，并在一次成功
重连后原子删除和轮换。

Prometheus 只在本机 `127.0.0.1:9091/metrics` 暴露：`poker_online_tables`、
`poker_active_connections`、`poker_abnormal_disconnects_total`、`poker_action_timeouts_total`。
需要远程采集时应由本机 Prometheus 或受认证反代抓取，绝不直接对公网开放。PM2 发出
`SIGTERM` 时服务会停收新连接、排空 Actor、关闭时钟并将加密边界内的牌桌快照写入
`/var/lib/poker-server/table-snapshot.json`；该文件为机密状态，应限制为部署用户可读。

安装 Nginx 后，将 `deploy/nginx.conf` 中的域名和证书路径替换为实际值，
再启用并校验配置：

```bash
sudo install -m 644 deploy/nginx.conf /etc/nginx/sites-available/poker.conf
sudo ln -s /etc/nginx/sites-available/poker.conf /etc/nginx/sites-enabled/poker.conf
sudo nginx -t
sudo systemctl reload nginx
```

`/ws` 使用 HTTP/1.1 Upgrade 转发到 `127.0.0.1:8080`；服务器每 15 秒发送
一次心跳，而 Nginx 的 `proxy_read_timeout` 固定为 60 秒，保留了四个心跳周期的余量。

## PM2 与日志轮转

`ecosystem.config.js` 保持一个名为 `poker-server` 的 `fork` 实例，日志写入
`/var/log/poker-server/`。工作流会安装并配置 `pm2-logrotate`：单文件 10 MB、保留
14 个压缩归档、按日期命名。首次服务器准备也可手动执行：

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

部署阶段必须使用与配置一致的精确进程名：

```bash
pm2 reload poker-server
```

## GitHub Actions 密钥

在仓库的 `production` Environment 中配置：

| 密钥 | 内容 |
| --- | --- |
| `PROD_HOST` | 服务器主机名或 IP |
| `PROD_USER` | 部署用户，例如 `deploy` |
| `ACTIONS_DEPLOY_KEY` | 该用户的 Ed25519 私钥；仅存于 GitHub Environment Secret，绝不写入仓库 |
| `ACTIONS_DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -H <host>` 得到的整行主机指纹 |

向 `main` 推送或推送形如 `v1.2.3` 的标签都会运行部署。工作流先运行后端
`npm run test`，再编译后端和 Vite 前端，然后同步产物与后端依赖清单。远端最后运行
`npm ci --omit=dev`，并执行 `pm2 reload poker-server`。

## 本地验证

后端的 `test` 脚本已改为真实的 Node 测试，而不是返回失败的占位符：

```bash
cd poker-server && npm ci && npm run test && npm run build
cd ../client
npm ci
npm run build
```
