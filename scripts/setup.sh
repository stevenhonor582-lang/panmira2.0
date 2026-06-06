#!/bin/bash
# ── Panmira 一键安装脚本 ──────────────────────────────────
# 用法: ./scripts/setup.sh
# 前置: Node.js >= 18, PostgreSQL >= 14 (或 Docker)
set -euo pipefail

PANMIRA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── 1. 检查依赖 ──
info "检查依赖..."

# Node.js
if ! command -v node &>/dev/null; then
  error "Node.js 未安装。请安装 Node.js >= 18: https://nodejs.org/"
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js 版本过低 (当前 v${NODE_VERSION})，需要 >= 18"
fi
info "Node.js $(node -v) ✓"

# ── 2. 交互式配置 ──
ENV_FILE="$PANMIRA_DIR/.env"
EXAMPLE_FILE="$PANMIRA_DIR/.env.example"

if [ -f "$ENV_FILE" ]; then
  warn ".env 已存在，跳过配置。如需重新配置，请删除 .env 后重试。"
else
  if [ ! -f "$EXAMPLE_FILE" ]; then
    error ".env.example 不存在，请确认仓库完整性"
  fi

  info "配置 Panmira（直接回车使用默认值）"

  read -rp "AI API Key (必填): " API_KEY
  if [ -z "$API_KEY" ]; then
    error "API Key 不能为空"
  fi

  read -rp "AI Base URL [https://api.anthropic.com]: " BASE_URL
  BASE_URL=${BASE_URL:-https://api.anthropic.com}

  read -rp "管理后台密码 [panmira2025secret]: " API_SECRET
  API_SECRET=${API_SECRET:-panmira2025secret}

  read -rp "数据库连接串 [postgresql://metabot:metabot@localhost:5432/metabot]: " DB_URL
  DB_URL=${DB_URL:-postgresql://metabot:metabot@localhost:5432/metabot}

  read -rp "API 端口 [9100]: " API_PORT
  API_PORT=${API_PORT:-9100}

  # 生成随机密钥
  ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")
  JWT_SECRET=$(openssl rand -hex 16 2>/dev/null || echo "jwt-$(date +%s)")

  # 生成 .env
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  sed -i "s|^ANTHROPIC_AUTH_TOKEN=.*|ANTHROPIC_AUTH_TOKEN=${API_KEY}|" "$ENV_FILE"
  sed -i "s|^ANTHROPIC_BASE_URL=.*|ANTHROPIC_BASE_URL=${BASE_URL}|" "$ENV_FILE"
  sed -i "s|^API_SECRET=.*|API_SECRET=${API_SECRET}|" "$ENV_FILE"
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" "$ENV_FILE"
  sed -i "s|^API_PORT=.*|API_PORT=${API_PORT}|" "$ENV_FILE"
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" "$ENV_FILE"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"

  info ".env 已生成"
fi

# ── 3. 安装依赖 ──
info "安装后端依赖..."
cd "$PANMIRA_DIR"
npm ci --include=dev 2>/dev/null || npm install

info "安装前端依赖..."
cd "$PANMIRA_DIR/web"
npm ci --include=dev 2>/dev/null || npm install

# ── 4. 构建 ──
info "构建前端..."
cd "$PANMIRA_DIR/web"
npm run build

info "构建后端..."
cd "$PANMIRA_DIR"
npm run build

# ── 5. 数据库初始化 ──
info "检查数据库..."

# 尝试连接数据库
source "$ENV_FILE" 2>/dev/null || true
DB_URL="${DATABASE_URL:-postgresql://metabot:metabot@localhost:5432/metabot}"

if command -v psql &>/dev/null; then
  if psql "$DB_URL" -c "SELECT 1" &>/dev/null; then
    info "数据库连接成功"

    # 检查是否需要初始化 schema
    TABLE_COUNT=$(psql "$DB_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d ' ')
    if [ "${TABLE_COUNT:-0}" -lt 5 ]; then
      info "初始化数据库 schema..."
      psql "$DB_URL" -f "$PANMIRA_DIR/scripts/schema.sql"
      info "Schema 初始化完成"
    else
      info "数据库已有表，跳过 schema 初始化"
    fi
  else
    warn "无法连接数据库。请确认 PostgreSQL 正在运行，且连接串正确。"
    warn "手动初始化: psql '\$DATABASE_URL' -f scripts/schema.sql"
  fi
else
  warn "psql 未安装。请手动初始化数据库:"
  warn "  psql '\$DATABASE_URL' -f scripts/schema.sql"
fi

# ── 6. Claude Code 检查 ──
if command -v claude &>/dev/null; then
  info "Claude Code $(claude --version 2>/dev/null || echo '已安装') ✓"
else
  warn "Claude Code 未安装（可选）。安装: npm install -g @anthropic-ai/claude-code"
fi

# ── 7. 完成 ──
echo ""
info "════════════════════════════════════════"
info "  Panmira 安装完成！"
info "════════════════════════════════════════"
echo ""
info "启动方式:"
echo "  开发模式:  npm run dev"
echo "  生产模式:  npm run start"
echo "  Docker:    docker-compose up -d"
echo ""
info "管理后台: http://localhost:${API_PORT:-9100}"
info "默认密码: 见 .env 中的 API_SECRET"
