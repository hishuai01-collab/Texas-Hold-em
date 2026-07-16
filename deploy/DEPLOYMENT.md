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
sudo mkdir -p /var/www/poker-server/dist /var/www/poker-client/dist /var/log/poker-server
sudo chown -R deploy:deploy /var/www/poker-server /var/www/poker-client /var/log/poker-server
cd /var/www/poker-server
npm ci --omit=dev
pm2 start ecosystem.config.js --only poker-server
pm2 save
pm2 startup
```

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
