#!/bin/bash
# ============================================================
# VMT 三层一致性检查器
# 用法: bash vmt-consistency-check.sh [--json]
# 检查: 技能层 / Agent模板层 / 知识层 / Bot映射 / 文件层
# ============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0
JSON_MODE=false
[[ "${1:-}" == "--json" ]] && JSON_MODE=true

pass() { PASS=$((PASS+1)); $JSON_MODE || echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { FAIL=$((FAIL+1)); $JSON_MODE || echo -e "${RED}[FAIL]${NC} $1"; }
warn() { WARN=$((WARN+1)); $JSON_MODE || echo -e "${YELLOW}[WARN]${NC} $1"; }
section() { $JSON_MODE || echo -e "\n${YELLOW}=== $1 ===${NC}"; }

# ============================================================
# SECTION 1: 技能层一致性
# ============================================================
section "1. 技能层: 全局技能 vs Agent模板 vs Orchestration"

GLOBAL_SKILLS=$(ls ~/.claude/skills/ 2>/dev/null | grep '^vmt-' | sort)
GLOBAL_COUNT=$(echo "$GLOBAL_SKILLS" | grep -c . || echo 0)
[[ $GLOBAL_COUNT -ge 20 ]] && pass "全局vmt技能: $GLOBAL_COUNT个" || fail "全局vmt技能仅$GLOBAL_COUNT个(<20)"

# 检查废弃技能是否误留
DEPRECATED=("vmt-de-ai-proofing" "vmt-readability-audit" "vmt-narrative-flow-check" "vmt-force-trim")
for sk in "${DEPRECATED[@]}"; do
  if echo "$GLOBAL_SKILLS" | grep -q "^$sk$"; then
    fail "废弃技能仍存在: $sk"
  else
    pass "废弃技能已清除: $sk"
  fi
done

# Agent模板skills vs 全局skills
AGENT_SKILLS=$(PGPASSWORD=panmira2025vmt psql -h 127.0.0.1 -U ubuntu -d panmira -t -c "SELECT DISTINCT jsonb_array_elements_text(skills) FROM agents WHERE skills IS NOT NULL;" 2>/dev/null | tr -d ' ' | grep -v '^$' || true)

MISSING_IN_GLOBAL=""
while IFS= read -r ask; do
  [[ -z "$ask" ]] && continue
  if ! echo "$GLOBAL_SKILLS" | grep -q "^$ask$"; then
    MISSING_IN_GLOBAL="$MISSING_IN_GLOBAL $ask"
  fi
done <<< "$AGENT_SKILLS"

[[ -z "$MISSING_IN_GLOBAL" ]] && pass "Agent模板技能全部存在于全局" || fail "Agent引用了不存在的技能:$MISSING_IN_GLOBAL"

# 检查 Agent 模板是否引用了废弃技能
for sk in "${DEPRECATED[@]}"; do
  if echo "$AGENT_SKILLS" | grep -q "^$sk$"; then
    fail "Agent模板含废弃技能: $sk"
  fi
done

# ============================================================
# SECTION 2: Agent模板层
# ============================================================
section "2. Agent模板层: 去重 + prompt长度 + 完整性"

# 检查重复agent名
DUPS=$(PGPASSWORD=panmira2025vmt psql -h 127.0.0.1 -U ubuntu -d panmira -t -c "SELECT name, count(*) FROM agents GROUP BY name HAVING count(*) > 1;" 2>/dev/null)
[[ -z "$DUPS" ]] && pass "无重复Agent模板" || fail "存在重复Agent:$DUPS"

# system_prompt 长度检查
LONG_PROMPTS=$(PGPASSWORD=panmira2025vmt psql -h 127.0.0.1 -U ubuntu -d panmira -t -c "SELECT name, length(system_prompt) FROM agents WHERE length(system_prompt) > 500;" 2>/dev/null)
[[ -z "$LONG_PROMPTS" ]] && pass "所有system_prompt < 500字" || warn "以下system_prompt过长(>500字):$LONG_PROMPTS"

# 检查 agents 总数
AGENT_COUNT=$(PGPASSWORD=panmira2025vmt psql -h 127.0.0.1 -U ubuntu -d panmira -t -c "SELECT count(*) FROM agents;" 2>/dev/null | tr -d ' ')
[[ "$AGENT_COUNT" -le 12 ]] && pass "Agent模板数量: $AGENT_COUNT (合理)" || warn "Agent模板数量: $AGENT_COUNT (偏多)"

# ============================================================
# SECTION 3: Bot-Agent 映射
# ============================================================
section "3. Bot-Agent映射: 一致性"

BOT_AGENTS=$(PGPASSWORD=panmira2025vmt psql -h 127.0.0.1 -U ubuntu -d panmira -t -c "SELECT name, config_json->>'agentId' FROM bot_configs WHERE is_active=true;" 2>/dev/null)

while IFS='|' read -r bot_name agent_id; do
  bot_name=$(echo "$bot_name" | xargs)
  agent_id=$(echo "$agent_id" | xargs)
  [[ -z "$bot_name" ]] && continue
  
  # 检查agent是否存在
  AGENT_EXISTS=$(PGPASSWORD=panmira2025vmt psql -h 127.0.0.1 -U ubuntu -d panmira -t -c "SELECT count(*) FROM agents WHERE id='$agent_id';" 2>/dev/null | tr -d ' ')
  if [[ "$AGENT_EXISTS" == "1" ]]; then
    AGENT_NAME=$(PGPASSWORD=panmira2025vmt psql -h 127.0.0.1 -U ubuntu -d panmira -t -c "SELECT name FROM agents WHERE id='$agent_id';" 2>/dev/null | xargs)
    pass "$bot_name → $AGENT_NAME ($agent_id)"
  else
    fail "$bot_name → agent $agent_id 不存在!"
  fi
  
  # 检查对应的 workspace 和 CLAUDE.md
  WORKSPACE_DIR=$(echo "$bot_name" | sed 's/ //g')
  WS_PATH="/home/ubuntu/workspace-$WORKSPACE_DIR"
  # 特殊处理 VMT内容工场
  [[ "$bot_name" == "VMT内容工场" ]] && WS_PATH="/home/ubuntu/workspace-VMT内容工场"
  
  if [[ -d "$WS_PATH" ]]; then
    if [[ -f "$WS_PATH/CLAUDE.md" ]]; then
      FIRST_LINE=$(head -1 "$WS_PATH/CLAUDE.md")
      if echo "$FIRST_LINE" | grep -q "VMT"; then
        pass "  CLAUDE.md: 存在(VMT-aware)"
      else
        warn "  CLAUDE.md: 存在但非VMT模板"
      fi
    else
      fail "  CLAUDE.md: 缺失! ($WS_PATH)"
    fi
  else
    fail "  Workspace目录不存在: $WS_PATH"
  fi
done <<< "$BOT_AGENTS"

# ============================================================
# SECTION 4: 知识层
# ============================================================
section "4. 知识层: MemoryManager + 共享目录"

# MemoryManager 健康
MM_HEALTH=$(curl -s http://localhost:37700/health 2>/dev/null || echo '{"status":"down"}')
if echo "$MM_HEALTH" | grep -q '"ok"'; then
  pass "MemoryManager: 运行中"
else
  fail "MemoryManager: 不可用"
fi

# VMT-知识库
if [[ -d /home/ubuntu/VMT-知识库 ]] && [[ -f /home/ubuntu/VMT-知识库/INDEX.json ]]; then
  pass "VMT-知识库: 目录+INDEX.json存在"
else
  fail "VMT-知识库: 缺失"
fi

# VMT-共享素材
if [[ -d /home/ubuntu/VMT-共享素材 ]] && [[ -f /home/ubuntu/VMT-共享素材/INDEX.json ]]; then
  pass "VMT-共享素材: 目录+INDEX.json存在"
else
  fail "VMT-共享素材: 缺失"
fi

# 知识沉淀文件数量 vs MemoryManager文档
DEPOSIT_COUNT=$(find /home/ubuntu/workspace-VMT内容工场/知识沉淀/ -name '*.md' 2>/dev/null | wc -l)
[[ "$DEPOSIT_COUNT" -gt 0 ]] && warn "知识沉淀文件 $DEPOSIT_COUNT 个仅在文件系统(未入MemoryManager)" || pass "无滞留学生知识沉淀文件"

# ============================================================
# SECTION 5: 文件层 — CLAUDE.md 全局一致性
# ============================================================
section "5. 文件层: 关键配置文件"

# 全局 CLAUDE.md
for f in ~/.claude/CLAUDE.md /home/ubuntu/workspace/CLAUDE.md; do
  if [[ -f "$f" ]]; then
    if grep -q "VMT.*内容工厂" "$f"; then
      pass "$f: VMT宪法"
    else
      warn "$f: 存在但非VMT模板"
    fi
  else
    fail "$f: 缺失"
  fi
done

# 默认模板
DEFAULT_TEMPLATE=~/panmira/src/workspace/CLAUDE.md
if [[ -f "$DEFAULT_TEMPLATE" ]]; then
  if grep -q "VMT" "$DEFAULT_TEMPLATE"; then
    pass "默认模板: VMT-aware"
  else
    warn "默认模板: 非VMT(新bot将缺少VMT指引)"
  fi
else
  fail "默认模板: 缺失"
fi

# ============================================================
# SECTION 6: 幽灵检查
# ============================================================
section "6. 幽灵目录检查"

GHOSTS=""
for d in /home/ubuntu/workspace-*; do
  name=$(basename "$d")
  has_claude=false
  has_content=false
  [[ -f "$d/CLAUDE.md" ]] && has_claude=true
  [[ $(find "$d" -type f 2>/dev/null | wc -l) -gt 2 ]] && has_content=true
  
  if ! $has_claude && ! $has_content; then
    GHOSTS="$GHOSTS $name"
  fi
done

[[ -z "$GHOSTS" ]] && pass "无幽灵workspace目录" || warn "发现幽灵目录:$GHOSTS"

# ============================================================
# SUMMARY
# ============================================================
section "汇总"

TOTAL=$((PASS + FAIL + WARN))
echo -e "通过: ${GREEN}$PASS${NC}  |  失败: ${RED}$FAIL${NC}  |  警告: ${YELLOW}$WARN${NC}  |  总计: $TOTAL"

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}发现问题! 请修复上面标记 [FAIL] 的项目。${NC}"
  exit 1
elif [[ $WARN -gt 0 ]]; then
  echo -e "\n${YELLOW}有警告项, 建议检查。${NC}"
  exit 0
else
  echo -e "\n${GREEN}全部通过! 三层系统一致。${NC}"
  exit 0
fi
