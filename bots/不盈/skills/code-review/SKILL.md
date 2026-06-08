---
name: code-review
version: 1.0.0
bot_id: bu-ying
layer: 2
status: stable

description: |
  Use when: 用户提交 GitHub PR URL、粘贴 git diff、@不盈 说"评审/Review"、要求检查代码改动时
  Do not use when: 用户讨论架构设计思路（升级到 design-schema）、查询 API 文档（升级到 xuan-jian）、临时 code question（直接对话即可）

requires:
  mcp:
    - github
  scripts:
    - scripts/fetch-pr.sh
    - scripts/diff-parser.py
    - scripts/lint-runner.sh
    - scripts/coverage-check.py
    - scripts/format-report.py
  references:
    - references/review-checklist.md
    - references/style-guide.md
    - references/severity-levels.md
    - references/report-template.md

resources:
  timeout_ms: 300000
  max_memory_mb: 512
  max_concurrent: 3

tags:
  - pr-review
  - static-analysis
  - architecture
  - security
---

# Code Review

> 自动化代码评审：静态分析 + LLM 评估 + 评审报告生成
> 所属 Bot：不盈 (bu-ying) | Layer 2 | v1.0.0

## 1. 触发条件

### 1.1 触发场景

- 消息包含 GitHub PR URL（`https://github.com/<owner>/<repo>/pull/<N>`）
- 消息以 `diff --git` 或 `---` 开头（粘贴 unified diff）
- 消息包含"评审 / Review / 审查 / review 一下"等关键词 + 代码块
- 用户 @不盈 说"看下这个 PR" / "review 一下" / "帮我审"

### 1.2 不触发场景

- 用户在讨论架构思路（升级到 `design-schema` skill）
- 用户想查询 API 文档（升级到 xuan-jian / knowledge-rag-qa）
- 一次性 code question，无 diff/PR 上下文（直接 LLM 自由对话）
- 业务逻辑是否正确（必须人工确认，不在评审范围）

## 2. 核心流程

```
用户消息
  ↓
[Clarification] 提取 pr_url / diff / focus_areas
  ↓
Step 1: scripts/fetch-pr.sh <pr_url>           → { title, author, base_sha, head_sha, diff, files_changed }
  ↓
Step 2: scripts/diff-parser.py < diff          → structured_changes[]
  ↓
Step 3: scripts/lint-runner.sh <files>         → lint_report
  ↓
Step 4: scripts/coverage-check.py <base> <head> → coverage_delta
  ↓
Step 5: AI 评估
  ├─ 读 references/review-checklist.md
  ├─ 读 references/severity-levels.md
  ├─ 读 references/language-specific/<lang>.md
  └─ 输出评审意见 JSON
  ↓
Step 6: scripts/format-report.py <eval_json>   → Markdown 报告
  ↓
Step 7: 写审计日志 runs/<date>/<pr_id>/exec.log + state/<pr_id>.json
  ↓
Step 8: 飞书卡片回复（标题 + 摘要 + 报告附件）
```

### 2.1 详细步骤

1. **解析输入**：从消息提取 `pr_url` / `diff` / `language` / `focus_areas`，缺必要字段触发反问
2. **拉取差异**：调用 `scripts/fetch-pr.sh <url>`，从 GitHub API 拉 PR 元数据 + diff
3. **静态分析**：调用 `scripts/diff-parser.py` 解析 diff 为结构化变更，调用 `scripts/lint-runner.sh` 跑项目 lint
4. **覆盖率检查**：调用 `scripts/coverage-check.py` 对比 base/head 覆盖率（工具缺失时优雅降级）
5. **AI 评估**：LLM 读 diff + 分析结果 + checklist + 语言特定要点，输出 must_fix / suggestions / severity_summary
6. **生成报告**：调用 `scripts/format-report.py` 套用 report-template 输出 Markdown
7. **写审计日志**：在 `runs/<YYYY-MM-DD>/<pr_id>/exec.log` 记录完整执行轨迹
8. **回复卡片**：飞书卡片显示报告摘要 + 评论链接 + 完整 Markdown 附件

## 3. 边界规则

| # | 规则 | 触发后行为 |
|---|------|-----------|
| 1 | 单 PR 超过 3000 行 diff | 拒绝评审，提示"请拆 PR，单 PR 建议 < 500 行" |
| 2 | LLM 输出置信度 < 0.7 | 标记为"待人工复核"，必改项附 confidence < 0.7 标记 |
| 3 | 检测到安全漏洞（hardcoded secret / SQL 注入 / 命令注入） | 立即阻断 + 标 P0 + 飞书紧急通知 |
| 4 | 不评审业务逻辑正确性 | 输出末尾明确声明"业务逻辑正确性须由人工确认" |
| 5 | 不修改代码 | 只输出评审意见，所有修改由用户 / bu-ying 实施 |

## 4. 文件读取时机

| 步骤 | 读取文件 | 用途 |
|------|---------|------|
| Step 1 解析 | `references/review-checklist.md` | 加载 8 大类检查项 |
| Step 5 AI 评估 | `references/severity-levels.md` | 应用 P0/P1/P2/P3 分级 |
| Step 5 AI 评估 | `references/language-specific/<lang>.md` | 语言特定评审要点 |
| Step 5 AI 评估 | `references/style-guide.md` | 风格统一性检查 |
| Step 6 生成报告 | `references/report-template.md` | 套用 Markdown 模板 |

## 5. 脚本调用时机

| 步骤 | 命令 | 输入 | 输出 |
|------|------|------|------|
| Step 2 | `scripts/fetch-pr.sh <pr_url>` | PR URL | JSON: title/author/diff/files |
| Step 3 | `scripts/diff-parser.py` | diff (stdin) | JSON: structured_changes[] |
| Step 3 | `scripts/lint-runner.sh <files>` | 逗号分隔文件列表 | JSON: lint_report |
| Step 4 | `scripts/coverage-check.py <base> <head> <dir>` | sha + 路径 | JSON: coverage_delta |
| Step 6 | `scripts/format-report.py` | eval JSON (stdin) | Markdown 报告 (stdout) |

### 5.1 脚本返回约定

- 成功：stdout 输出 JSON / Markdown，exit code = 0
- 失败：stderr 输出错误信息，exit code ≠ 0
- 优雅降级：coverage-check 工具缺失返回 `{"available": false}`，不视为失败

## 6. 验收标准

| # | 指标 | 目标 | 测量方法 |
|---|------|------|---------|
| 1 | 单 PR 评审时间 (P50) | < 90s | 计时器（Step 1 → Step 8） |
| 2 | LLM 评审与人工一致率 | ≥ 70% | 50 条样本回归集 |
| 3 | 严重等级误判率 | < 5% | 100 条样本 |
| 4 | 必改项漏报率 | < 10% | 回归测试集 |
| 5 | 静态分析误报率 | < 15% | 已知正常 PR 对照 |

## 7. 失败处理

| 失败场景 | 处理 |
|---------|------|
| GitHub API 401 (token 缺失) | 提示配置 GITHUB_TOKEN |
| GitHub API 404 (PR 不存在) | 提示检查 URL |
| GitHub API 500 | 重试 1 次，失败后提示稍后重试 |
| diff 解析失败 | 标记为"diff 不可解析"，提示用户重贴 |
| lint 工具缺失 | 输出空 lint_report，继续评审 |
| coverage 工具缺失 | 返回 `{"available": false}`，跳过覆盖率检查 |

## 8. 扩展

- **多语言支持**：当前支持 TypeScript / Python / Go，其他语言可扩展 `references/language-specific/`
- **自定义 checklist**：通过 fork 仓库修改 `references/review-checklist.md`
- **集成 CI**：可被 GitHub Actions / GitLab CI 调用，传入 PR URL
