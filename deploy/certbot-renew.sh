#!/usr/bin/env bash
# ── Let's Encrypt 证书自动续期脚本 ──
# 配合 certbot 使用，每日凌晨由 cron 触发。
# 续期成功后自动重载 Nginx。
#
# 安装 cron 任务（以 root 执行）：
#   sudo crontab -e
#   添加：0 3 * * * /var/www/poker-server/scripts/certbot-renew.sh >> /var/log/certbot-renew.log 2>&1
#
# 或使用 systemd timer（推荐）：
#   /etc/systemd/system/certbot-renew.service
#   /etc/systemd/system/certbot-renew.timer

set -euo pipefail

DOMAIN="${DOMAIN:-poker.example.com}"
NGINX_RELOAD_CMD="${NGINX_RELOAD_CMD:-systemctl reload nginx}"
LOG_FILE="${LOG_FILE:-/var/log/certbot-renew.log}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting cert renewal check for ${DOMAIN}..."

# dry-run 标志：实际运行前可先测试
DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo "[DRY-RUN] 模式"
fi

# 检查 certbot 是否安装
if ! command -v certbot &>/dev/null; then
  echo "[ERROR] certbot 未安装。请先安装：sudo apt install certbot python3-certbot-nginx"
  exit 1
fi

# 执行续期
certbot renew \
  --non-interactive \
  --agree-tos \
  --preferred-challenges http \
  --deploy-hook "${NGINX_RELOAD_CMD}" \
  ${DRY_RUN} 2>&1 | tee -a "${LOG_FILE}"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cert renewal completed successfully."
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cert renewal encountered issues (exit code: ${EXIT_CODE}). Check log."
fi

exit $EXIT_CODE