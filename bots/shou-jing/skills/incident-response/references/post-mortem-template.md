# 事后复盘模板（Post-Mortem）

> 守静在 Step 10 写 post-mortem 时套用本文档。事故关闭后 48h 内发布。

## 模板

```markdown
# Post-Mortem: {incident_title}

> 事件 ID：`{incident_id}`
> 严重等级：P{level}
> 状态：published
> 发布日期：{publish_date}
> 作者：守静 (auto-generated draft) + {author}

## 1. 摘要 (Summary)

{tl_dr}

## 2. 影响 (Impact)

| 指标 | 数值 |
|------|------|
| 总时长 | {total_duration} 分钟 |
| 受影响用户 | ~{user_count} |
| 错误率峰值 | {peak_error_rate}% |
| 业务损失 | {business_loss} |
| 数据丢失 | {data_loss}（无 / 详情） |

## 3. 时间线 (Timeline)

| 时间 (UTC) | 事件 | 操作人 |
|-----------|------|--------|
| {ts_1} | 告警触发 | 系统 |
| {ts_2} | 战时群建立 | 守静 |
| {ts_3} | oncall 通知 | 守静 |
| {ts_4} | 根因定位 | @不盈 |
| {ts_5} | 缓解完成 | @不盈 |
| {ts_6} | 事故关闭 | 守静 |

## 4. 根因 (Root Cause)

### 4.1 直接原因

> {direct_cause}

### 4.2 贡献因素

- {contributing_factor_1}
- {contributing_factor_2}

### 4.3 5 Whys 分析

1. **为什么**出现 5xx？ → 因为 DB 连接池耗尽
2. **为什么**连接池耗尽？ → 因为有 N+1 查询
3. **为什么**有 N+1 查询？ → 因为新代码未做 ORM 优化
4. **为什么**未做 ORM 优化？ → 因为 code-review checklist 缺 N+1 检查
5. **为什么**checklist 缺 N+1？ → 因为历史未发生过类似问题

## 5. 修复 (Resolution)

### 5.1 立即修复

- {immediate_fix_1}
- {immediate_fix_2}

### 5.2 验证

- {verification_step_1}
- {verification_step_2}

## 6. 检测 (Detection)

- **检测时间**：{detection_time}
- **响应时间**：{response_time} 分钟
- **检测方式**（监控告警 / 用户报告 / 内部发现）

## 7. 响应 (Response)

- **响应人**：{responders}
- **响应效率**：{response_grade}（A/B/C/D）
- **响应问题**：{response_issues}

## 8. 改进项 (Action Items)

| # | 行动 | 负责人 | 截止日期 | 优先级 |
|---|------|--------|---------|--------|
| 1 | {action_1} | @不盈 | {due_date_1} | P0 |
| 2 | {action_2} | @守静 | {due_date_2} | P1 |
| 3 | {action_3} | @信言 | {due_date_3} | P2 |

## 9. 经验教训 (Lessons Learned)

### 9.1 做得好的

- {what_went_well_1}
- {what_went_well_2}

### 9.2 待改进

- {what_to_improve_1}
- {what_to_improve_2}

## 10. 附录 (Appendix)

- 完整执行日志：`runs/{date}/{incident_id}/exec.log`
- 监控截图：{screenshot_links}
- 相关 PR：{pr_links}
- 相关 runbook：{runbook_links}
```

## 填写指南

- **摘要**：用 1-2 句话描述发生了什么 + 影响
- **时间线**：尽量精确到分钟
- **5 Whys**：至少 3 层，找到系统性原因
- **改进项**：必须指定负责人 + 截止日期
- **经验教训**：客观，既要肯定好的也要指出问题
- **附录**：保留所有原始证据（永不删日志）

## 审查流程

1. 守静生成初稿（auto-draft）
2. oncall 研发（@不盈）补充技术细节
3. 通讯负责人（@信言）补充对外影响
4. oncall 主管审查事实
5. 发布到内部 wiki + 飞书群通知
