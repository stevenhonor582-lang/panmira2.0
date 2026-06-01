# 环境配置差异表（dev / staging / prod）

> 三个环境的配置、权限、变更窗口差异。

## 环境矩阵

| 维度 | dev | staging | prod |
|------|-----|---------|------|
| **用途** | 开发自测 | 集成测试/UAT | 生产 |
| **K8s namespace** | `dev` | `staging` | `prod` |
| **副本数** | 1 | 2 | 3+ (HPA) |
| **资源 limits** | 0.5/256Mi | 1/512Mi | 2/1Gi+ |
| **审批人** | 自动 | Tech Lead | CIO/CEO |
| **变更窗口** | 全天 | 9:00-22:00 | 22:00-9:00（高峰外） |
| **审批 SLA** | 0min | 30min | 2h |
| **数据** | 假数据 | 脱敏生产数据 | 真实数据 |
| **回滚保留** | 3 天 | 7 天 | 7 天 |
| **监控级别** | INFO | INFO + WARN | INFO + WARN + ERROR + PagerDuty |
| **审计日志** | 本地 | S3 | S3 + 冷归档 90 天 |

## 审批流

### dev
- 自动执行，无需审批
- 任何 deployer 可触发
- 失败仅通知 deployer

### staging
- Tech Lead 审批（飞书 user_id 必填）
- 30min 未批 → 自动取消 + 通知
- 失败通知 deployer + Tech Lead

### prod
- CIO 或 CEO 审批（飞书 user_id 必填）
- 2h 未批 → 自动取消
- **特殊规则**：
  - 高峰 9:00-18:00 需 special approval
  - DB DDL 需 DBA + CIO 双重审批
  - 失败立即触发 incident-response

## 资源限制

```yaml
# dev
resources:
  requests: {cpu: "100m", memory: "128Mi"}
  limits:   {cpu: "500m", memory: "256Mi"}

# staging
resources:
  requests: {cpu: "200m", memory: "256Mi"}
  limits:   {cpu: "1",    memory: "512Mi"}

# prod
resources:
  requests: {cpu: "500m", memory: "512Mi"}
  limits:   {cpu: "2",    memory: "1Gi"}
```

## 数据库连接

| 环境 | DB 实例 | 连接池 | 备份频率 |
|------|---------|--------|---------|
| dev | dev-db.shared | 5 conn | 无 |
| staging | staging-db.shared | 20 conn | 每日 |
| prod | prod-db.cluster | 50 conn | 每 6h + 实时 binlog |
