#!/usr/bin/env bash
# ── 环境变量缺失校验脚本 ──
# 在 poker-server 启动前运行，检查所有必需的环境变量是否已配置。
# 缺失时输出错误并退出（非零），避免服务在缺少关键配置的情况下启动。
#
# 用法：
#   bash scripts/env-check.sh
#   # 或作为 npm script: "prestart": "bash scripts/env-check.sh"
#
# 环境变量来源优先级：
#   1. 进程环境变量（process.env）
#   2. /etc/poker-server/env（生产环境）
#   3. .env 文件（开发环境，不提交到仓库）

set -euo pipefail

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ── 必需变量列表 ──
# 格式：VAR_NAME:description
REQUIRED_VARS=(
  "REDIS_URL:Redis 连接字符串（如 redis://:password@127.0.0.1:6379/0）"
)

# ── 条件必需变量（仅在特定条件下需要） ──
CONDITIONAL_VARS=(
  "TG_BOT_TOKEN:Telegram Admin Bot Token（生产环境建议配置）"
  "ADMIN_TG_ID:Telegram 管理员用户 ID（配合 TG_BOT_TOKEN 使用）"
  "TELEGRAM_CHAT_ID:Telegram 告警通知群组 ID（配合 TG_BOT_TOKEN 使用）"
)

# ── 可选但建议配置的变量 ──
OPTIONAL_VARS=(
  "ACTION_SIG_KEY:Action 签名密钥（生产环境应使用 KMS 管理的密钥）"
  "ALLOWED_ORIGINS:CORS 允许的域名列表（逗号分隔，默认 *）"
  "IP_BAN_TTL_MS:IP 拉黑时长（毫秒，默认 60000）"
  "IP_STRIKES_TO_BAN:触发拉黑的违规次数（默认 3）"
  "METRICS_PORT:Prometheus 指标端口（默认 9091）"
  "HTTP_API_PORT:HTTP API 端口（默认 8081）"
  "BOTS:默认桌机器人数量（仅开发/演示用）"
)

MISSING=0

echo -e "${YELLOW}━━━ 环境变量检查 ━━━${NC}"
echo ""

# ── 尝试加载 /etc/poker-server/env ──
if [ -r /etc/poker-server/env ]; then
  echo -e "${GREEN}[INFO]${NC} 加载 /etc/poker-server/env"
  set -a
  . /etc/poker-server/env
  set +a
fi

# ── 尝试加载 .env（仅开发环境） ──
if [ -r .env ] && [ "${NODE_ENV:-}" != "production" ]; then
  echo -e "${GREEN}[INFO]${NC} 加载 .env"
  set -a
  . .env
  set +a
fi

echo ""
echo -e "${YELLOW}--- 必需变量 ---${NC}"
for entry in "${REQUIRED_VARS[@]}"; do
  VAR="${entry%%:*}"
  DESC="${entry#*:}"
  if [ -z "${!VAR:-}" ]; then
    echo -e "  ${RED}✗${NC} $VAR — $DESC"
    MISSING=1
  else
    echo -e "  ${GREEN}✓${NC} $VAR"
  fi
done

echo ""
echo -e "${YELLOW}--- 条件必需变量 ---${NC}"
for entry in "${CONDITIONAL_VARS[@]}"; do
  VAR="${entry%%:*}"
  DESC="${entry#*:}"
  if [ -z "${!VAR:-}" ]; then
    echo -e "  ${YELLOW}?${NC} $VAR — $DESC（未配置，相关功能将禁用）"
  else
    echo -e "  ${GREEN}✓${NC} $VAR"
  fi
done

echo ""
echo -e "${YELLOW}--- 可选变量 ---${NC}"
for entry in "${OPTIONAL_VARS[@]}"; do
  VAR="${entry%%:*}"
  DESC="${entry#*:}"
  if [ -z "${!VAR:-}" ]; then
    echo -e "  ${YELLOW}?${NC} $VAR — $DESC（使用默认值）"
  else
    echo -e "  ${GREEN}✓${NC} $VAR"
  fi
done

echo ""
if [ "$MISSING" -eq 1 ]; then
  echo -e "${RED}✗ 存在缺失的必需环境变量，请配置后重试。${NC}"
  echo -e "${YELLOW}  参考 .env.example 文件。${NC}"
  exit 1
else
  echo -e "${GREEN}✓ 所有必需环境变量已配置。${NC}"
  exit 0
fi