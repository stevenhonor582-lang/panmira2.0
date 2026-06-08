#!/usr/bin/env bash
#
# fetch-pr.sh — 拉取 GitHub PR 元数据 + diff
# 输入: $1 = PR URL (https://github.com/<owner>/<repo>/pull/<N>)
# 输出: JSON { title, author, base_sha, head_sha, diff, files_changed[] }
# 依赖: curl, jq（jq 用于 JSON 解析；如缺失则用 python3 替代）
# 环境变量: GITHUB_TOKEN（可选，但强烈建议设置以避免限流）
#
set -euo pipefail

PR_URL="${1:-}"
if [ -z "$PR_URL" ]; then
  echo "Usage: $0 <github-pr-url>" >&2
  exit 64
fi

if ! echo "$PR_URL" | grep -qE '^https://github\.com/[^/]+/[^/]+/pull/[0-9]+'; then
  echo "Error: invalid GitHub PR URL: $PR_URL" >&2
  exit 65
fi

OWNER_REPO_PR=$(echo "$PR_URL" | sed -E 's#https://github\.com/##; s#/pull/#/pulls/#')
PR_NUMBER=$(echo "$PR_URL" | grep -oE '/pull/[0-9]+' | grep -oE '[0-9]+')

API_BASE="https://api.github.com"

# 构造认证头
AUTH_HEADER=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

# 拉 PR 元数据
PR_JSON=$(curl -sS -f -L \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "${AUTH_HEADER[@]}" \
  "${API_BASE}/repos/${OWNER_REPO_PR%.git}" 2>&1) || {
  code=$?
  echo "Error: GitHub API request failed (curl exit $code)" >&2
  case $code in
    6)  echo "Hint: cannot resolve api.github.com — check network" >&2 ;;
    22) echo "Hint: HTTP 4xx/5xx — check PR exists and GITHUB_TOKEN is valid" >&2 ;;
  esac
  exit 70
}

# 拉 diff
DIFF_RAW=$(curl -sS -L \
  -H "Accept: application/vnd.github.v3.diff" \
  "${AUTH_HEADER[@]}" \
  "${API_BASE}/repos/${OWNER_REPO_PR%.git}" 2>&1) || {
  echo "Error: failed to fetch diff" >&2
  exit 71
}

# JSON 解析（jq 优先，python3 兜底）
extract() {
  local key="$1" json="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -r "$key"
  else
    echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d$key'))"
  fi
}

TITLE=$(extract '.title' "$PR_JSON")
AUTHOR=$(extract '.user.login' "$PR_JSON")
BASE_SHA=$(extract '.base.sha' "$PR_JSON")
HEAD_SHA=$(extract '.head.sha' "$PR_JSON")

# diff 用 jq 需要转义；改用 python3 安全构造
python3 - "$TITLE" "$AUTHOR" "$BASE_SHA" "$HEAD_SHA" <<'PY' "$DIFF_RAW"
import sys, json
title, author, base_sha, head_sha = sys.argv[1:5]
diff = sys.stdin.read()
files_changed = []
for line in diff.splitlines():
    if line.startswith('diff --git '):
        parts = line.split(' ')
        if len(parts) >= 4:
            b = parts[2].lstrip('a/')
            a = parts[3].lstrip('b/')
            if b == a:
                files_changed.append(b)
            else:
                files_changed.append(f"{b} -> {a}")
out = {
    "title": title,
    "author": author,
    "base_sha": base_sha,
    "head_sha": head_sha,
    "diff": diff,
    "files_changed": files_changed,
}
print(json.dumps(out, ensure_ascii=False, indent=2))
PY

# exit 0 隐含
