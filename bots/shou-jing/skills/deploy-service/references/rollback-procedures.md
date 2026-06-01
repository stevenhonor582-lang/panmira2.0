# 回滚流程与决策树

> 部署失败时如何快速回滚到上一个稳定版本。

## 触发条件

| 触发源 | 条件 | 行为 |
|--------|------|------|
| 健康检查失败 | 连续 3 次超时 | 自动回滚 |
| 冒烟测试失败 | 任意端点失败 | 自动回滚 |
| 业务指标异常 | 错误率 > 1% 持续 1min | 自动回滚 |
| 人工触发 | 用户说"回滚" | 立即回滚 |

## 回滚决策树

```
检测到部署失败
  ↓
是否在 5min 观察期内？
├─ 是 → 立即回滚（保留 7 天旧版本）
└─ 否 → 是否影响核心业务？
        ├─ 是 → 立即回滚
        └─ 否 → 通知 deployer 决策
                ├─ 确认回滚 → 走回滚流程
                └─ 接受问题 → 升级 incident-response
```

## 回滚流程

### 1. 蓝绿回滚
```bash
# Service selector 切回 Blue
kubectl patch svc <service> -p '{"spec":{"selector":{"version":"blue"}}}'
# Green 环境降级为非活跃（保留 7 天）
kubectl scale deployment <service>-green --replicas=0
```

### 2. 滚动回滚
```bash
# kubectl 自带
kubectl rollout undo deployment/<service> --to-revision=<N>
# 验证
kubectl rollout status deployment/<service>
```

### 3. 金丝雀回滚
```bash
# 流量切回 100% 旧版本（最快速）
kubectl patch ingress <service> -p '{"spec":{"rules":[{"host":"...","http":{"paths":[{"path":"/","backend":{"service":{"name":"<old>"}}}]}}]}}'
# Canary 副本缩 0
kubectl scale deployment <service>-canary --replicas=0
```

## 回滚限制

- **保留期**：旧版本保留 7 天（artifact + manifest + DB 快照）
- **连续回滚**：连续 3 次回滚暂停 skill 强制人工
- **DB 不兼容**：DDL 不可回滚，需 forward-fix
- **回滚失败**：升级到 `incident-response`

## 回滚后动作

1. 通知 deployer + approver（飞书）
2. 记录 `rollback_reason` + `rollback_duration_ms`
3. 生成回滚报告（与部署报告合并）
4. 7 天后清理旧版本（cron job）
5. Postmortem（如 P0/P1）
