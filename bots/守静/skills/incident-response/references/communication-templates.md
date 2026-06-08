# 通讯模板

> 守静在 Step 8 同步进展时套用本文档。3 个核心场景：开场 / 进度 / 收尾。

## 1. 开场通讯（P0 / P1 必发）

### 模板

```markdown
[P{level}] {incident_title}

**检测时间**：{detected_at}
**影响服务**：{affected_service}
**当前状态**：investigating
**初步影响**：{impact_summary}

**当前已知**：
- 错误率：{error_rate}%
- 受影响用户：~{user_count}
- 持续时间：{duration}

**已采取行动**：
- [x] 战时群已建立
- [x] oncall 已通知（@{oncall_user}）
- [ ] 排查中...

**下一步**：
- {next_action_1}
- {next_action_2}

**进展同步频率**：每 {interval} 分钟
**事件 ID**：`{incident_id}`
```

### 示例

```markdown
[P0] mahubot-core 5xx 错误率飙升

**检测时间**：2026-06-01 10:23 UTC
**影响服务**：mahubot-core, mahubot-portal
**当前状态**：investigating
**初步影响**：核心 API 错误率 78%，~5000 用户不可用

**当前已知**：
- 错误率：78%
- 受影响用户：~5000
- 持续时间：3 分钟

**已采取行动**：
- [x] 战时群已建立
- [x] oncall 已通知（@不盈）
- [ ] 排查最近部署...

**下一步**：
- 拉最近 1h 部署记录
- 检查数据库主库状态
- 准备回滚到上一稳定版本

**进展同步频率**：每 5 分钟
**事件 ID**：`INC-20260601-001`
```

## 2. 进度通讯（每 5min / 15min）

### 模板

```markdown
[更新 P{level}] {incident_title} — T+{minutes}min

**当前状态**：{current_status}
**最新进展**：
- {update_1}
- {update_2}

**指标变化**：
- 错误率：{old_rate}% → {new_rate}%
- 延迟 P99：{old_p99}ms → {new_p99}ms

**下一步**：
- {next_action_1}
```

### 状态枚举

- `investigating` — 排查中
- `identified` — 已定位根因
- `mitigating` — 缓解中（已采取修复动作）
- `mitigated` — 已缓解（观察期）
- `resolved` — 已解决

## 3. 收尾通讯（事故关闭）

### 模板

```markdown
[已解决 P{level}] {incident_title}

**总时长**：{total_duration} 分钟
**开始**：{start_at}
**解决**：{resolved_at}
**影响范围**：
- 受影响用户：~{total_user_count}
- 错误率峰值：{peak_error_rate}%
- 业务影响：{business_impact}

**根因**：
> {root_cause}

**修复方案**：
> {fix_description}

**事后总结**：post-mortem 将在 48h 内发布
**事件 ID**：`{incident_id}`

感谢 {responders} 的快速响应。
```

### 示例

```markdown
[已解决 P0] mahubot-core 5xx 错误率飙升

**总时长**：23 分钟
**开始**：2026-06-01 10:23 UTC
**解决**：2026-06-01 10:46 UTC
**影响范围**：
- 受影响用户：~5000
- 错误率峰值：78%
- 业务影响：核心 API 23 分钟不可用

**根因**：
> 最近部署 v1.4.2 引入 N+1 查询，DB 连接池耗尽导致 5xx。

**修复方案**：
> 回滚到 v1.4.1 + 加 N+1 检测 + 调整连接池上限。

**事后总结**：post-mortem 将在 48h 内发布
**事件 ID**：`INC-20260601-001`

感谢 @不盈 @信言 的快速响应。
```

## 通讯频率

| 级别 | 开场 | 进度 | 收尾 |
|------|------|------|------|
| P0 | T+0min | 每 5min | 解决后立即 |
| P1 | T+0min | 每 15min | 解决后立即 |
| P2 | T+0min | 不需要 | 解决后飞书 |
| P3 | 不需要 | 不需要 | 加入 backlog |
