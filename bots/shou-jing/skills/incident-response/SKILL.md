---
name: incident-response
version: 1.0.0
bot_id: shou-jing
layer: 3
status: stable

description: |
  Use when: 监控告警（5xx / 错误率 / 延迟超标）触发、用户@守静 报告生产事故、飞书 webhook 推送告警、用户粘贴错误日志 + "这是什么故障"
  Do not use when: 日常部署（升级到 deploy-service）、一般性能问题（先用 monitor-setup）、单次开发环境问题（升级到不盈）、计划内维护

requires:
  mcp:
    - feishu
    - monitoring
  scripts:
    - scripts/classify-severity.py
    - scripts/check-health.sh
    - scripts/fetch-metrics.py
    - scripts/fetch-logs.py
    - scripts/check-runbook-match.py
    - scripts/format-incident-report.py
  references:
    - references/severity-classification.md
    - references/decision-tree.md
    - references/escalation-contacts.md
    - references/communication-templates.md
    - references/post-mortem-template.md
    - references/runbooks/

resources:
  timeout_ms: 300000
  max_memory_mb: 256
  max_concurrent: 5

tags:
  - oncall
  - incident
  - alerting
  - runbook
  - postmortem
---

# Incident Response

> 自动化事故响应：告警分级 + 资源协调 + 进展同步 + 事后复盘
> 所属 Bot：守静 (shou-jing) | Layer 3 | v1.0.0

## 1. 触发条件

### 1.1 触发场景

- 监控告警触发：5xx 飙升、错误率 > 5%、延迟 P99 超标
- 用户 @守静 说"故障 / 5xx / 告警 / 紧急 / P0 / P1 / 不行了 / 挂了"
- 飞书 webhook 推送告警（自动化触发）
- 用户粘贴错误日志 + "这是什么故障"

### 1.2 不触发场景

- 日常部署问题（升级到 `deploy-service`）
- 一般性能优化（先用 `monitor-setup` 建立基线）
- 开发环境报错（升级到 bu-ying / code-review）
- 计划内维护窗口（无需响应）
- 单次请求错误（→ `log-analyze` 单独分析）

## 2. 核心流程

```
告警 / 用户报告
  ↓
[Clarification] 必填: summary, affected_service
  ↓
Step 1: scripts/classify-severity.py          → severity (P0/P1/P2/P3)
  ↓
Step 2: scripts/check-health.sh               → service_health[]
  ↓
Step 3: scripts/fetch-metrics.py              → metrics snapshot
  ↓
Step 4: scripts/fetch-logs.py                 → relevant logs
  ↓
Step 5: scripts/check-runbook-match.py        → matched_runbook path
  ↓
Step 6: 决策树 (references/decision-tree.md)
  ├─ P0 → 立即开战时频道 + 自动降级
  ├─ P1 → 执行 runbook + 5min 内进展同步
  ├─ P2 → 排期处理
  └─ P3 → 加入 backlog
  ↓
Step 7: 协调资源 (@不盈 改代码 / @信言 发通讯)
  ↓
Step 8: 实时同步进展 (飞书卡片, 15min 间隔)
  ↓
Step 9: 解决后: scripts/format-incident-report.py
  ↓
Step 10: 写 post-mortem (48h 内, references/post-mortem-template.md)
```

### 2.1 详细步骤

1. **接收输入**：从告警 webhook / 用户消息提取 `summary` + `affected_service`，缺字段触发反问
2. **故障分级**：调用 `classify-severity.py` 基于关键词 + 规则输出 P0/P1/P2/P3
3. **健康检查**：调用 `check-health.sh` 拉多服务健康状态
4. **拉取指标**：调用 `fetch-metrics.py` 拉监控快照（错误率 / 延迟 / 流量）
5. **拉取日志**：调用 `fetch-logs.py` 按服务+关键词过滤最近日志
6. **匹配 runbook**：调用 `check-runbook-match.py` 匹配已知故障模式
7. **执行决策树**：根据严重度走 references/decision-tree.md 的对应分支
8. **协调资源**：P0/P1 立即 @不盈 + @信言 + 升级链（references/escalation-contacts.md）
9. **同步进展**：每 15min 用 communication-templates.md 推飞书卡片
10. **收尾**：调用 `format-incident-report.py` 输出结构化报告，48h 内写 post-mortem

## 3. 边界规则

| # | 规则 | 触发后行为 |
|---|------|-----------|
| 1 | 不直接修复代码 | 所有代码修改升级到 bu-ying，守静只做协调 |
| 2 | 不擅自变更生产环境 | 回滚 / 扩容 / 切流量必须人工确认 |
| 3 | 不删日志 / 审计记录 | 事故日志归档 1 年 |
| 4 | 涉及数据泄露 | 立即通报 + 拉法务（升级链最高层）|
| 5 | P0 5min 内无响应 | 自动升级到 oncall 主管（references/escalation-contacts.md）|
| 6 | 缓解后观察 30min | 错误率回基线才关闭事故 |
| 7 | 影响范围评估不确定 | 升一级处理（避免低估）|
| 8 | 不在事故中做未经测试的变更 | 只用预定义 runbook |

## 4. 文件读取时机

| 步骤 | 读取文件 | 用途 |
|------|---------|------|
| Step 1 分级 | `references/severity-classification.md` | 加载 P0/P1/P2/P3 定义 |
| Step 6 决策 | `references/decision-tree.md` | 选择响应动作 |
| Step 7 协调 | `references/escalation-contacts.md` | 拉人顺序 |
| Step 8 通讯 | `references/communication-templates.md` | 套用开场/进度/收尾模板 |
| Step 6 缓解 | `references/runbooks/<matched>.md` | 排查 + 修复步骤 |
| Step 10 复盘 | `references/post-mortem-template.md` | 时间线 + 根因 + 改进 |

## 5. 脚本调用时机

| 步骤 | 命令 | 输入 | 输出 |
|------|------|------|------|
| Step 1 | `scripts/classify-severity.py` | alert JSON (stdin) | JSON: severity + reasoning |
| Step 2 | `scripts/check-health.sh` | service list (args) | 健康状态行 |
| Step 3 | `scripts/fetch-metrics.py <svc> <window>` | 服务名 + 时间窗 | JSON: metrics snapshot |
| Step 4 | `scripts/fetch-logs.py <svc> <keyword>` | 服务名 + 关键词 | JSON: matched log lines |
| Step 5 | `scripts/check-runbook-match.py <symptoms>` | 症状文本 (stdin) | runbook path |
| Step 9 | `scripts/format-incident-report.py` | 事故 JSON (stdin) | Markdown 报告 |

### 5.1 脚本返回约定

- 成功：stdout 输出 JSON / Markdown，exit code = 0
- 失败：stderr 输出错误信息，exit code ≠ 0
- mock 数据：fetch-metrics / fetch-logs 在生产环境未对接时返回 mock 数据，不视为失败

## 6. 验收标准

| # | 指标 | 目标 | 测量方法 |
|---|------|------|---------|
| 1 | P0 响应时间 | < 5min | 计时器（告警 → 战时频道） |
| 2 | P1 响应时间 | < 15min | 计时器（告警 → 第一条进展） |
| 3 | 故障分级准确率 | ≥ 90% | 50 条历史样本 |
| 4 | runbook 匹配命中率 | ≥ 70% | 季度统计 |
| 5 | 通讯送达率 | ≥ 99% | 月度审计 |
| 6 | post-mortem 按时率 | ≥ 95% | 月度统计 |
| 7 | MTTR (P0/P1) | < 30min | 季度统计 |
| 8 | 升级合规率 | 100% | 季度审计 |

## 7. 失败处理

| 失败场景 | 处理 |
|---------|------|
| 飞书 webhook 401 | 提示配置 FEISHU_WEBHOOK_URL |
| Prometheus 不可达 | fetch-metrics 走 mock 数据 + 标记 degraded |
| 日志系统 5xx | 重试 1 次后返回最近 1h 缓存 |
| runbook 匹配无结果 | 输出 "no matched runbook"，提示人工排查 |
| 升级链中联系人不在线 | 跳到下一级 + 飞书标记 @all |

## 8. 扩展

- **新增 runbook**：在 `references/runbooks/` 加 markdown，check-runbook-match.py 自动支持
- **多集群支持**：扩展 fetch-metrics.py 支持 cluster 参数
- **集成 PagerDuty**：在 escalation-contacts.md 加 PD 账号
