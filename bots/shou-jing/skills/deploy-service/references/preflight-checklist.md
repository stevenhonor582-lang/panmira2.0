# 预检清单（Preflight Checklist）

> 部署前必须通过的 10+ 检查项。任何 **fatal** 失败立即终止部署；**warning** 通知用户确认。

## 检查项分类

### 1. 环境检查

| # | 检查项 | 级别 | 命令/方法 | 失败处理 |
|---|--------|------|----------|---------|
| 1.1 | K8s API 可达 | fatal | `kubectl cluster-info` | 立即终止 |
| 1.2 | 目标 namespace 存在 | fatal | `kubectl get ns <env>` | 立即终止 |
| 1.3 | 当前 deployer 身份 | fatal | `kubectl auth whoami` | 立即终止 |
| 1.4 | 上下文匹配 | fatal | `kubectl config current-context` | 立即终止 |

### 2. 权限检查

| # | 检查项 | 级别 | 失败处理 |
|---|--------|------|---------|
| 2.1 | RBAC: deployments | fatal | 立即终止 |
| 2.2 | RBAC: services/pods | fatal | 立即终止 |
| 2.3 | RBAC: configmaps/secrets | fatal | 立即终止 |
| 2.4 | SSH 密钥有效（备用） | warning | 通知 |

### 3. 资源检查

| # | 检查项 | 级别 | 阈值 | 失败处理 |
|---|--------|------|------|---------|
| 3.1 | CPU 配额 | warning | < 80% | 通知 |
| 3.2 | 内存配额 | warning | < 80% | 通知 |
| 3.3 | 磁盘空间 | fatal | 剩余 > 2GB | 立即终止 |
| 3.4 | Pod 数量配额 | warning | < 90% | 通知 |

### 4. 依赖检查

| # | 检查项 | 级别 | 失败处理 |
|---|--------|------|---------|
| 4.1 | 数据库连接 | fatal | 立即终止 |
| 4.2 | Redis 缓存 | fatal | 立即终止 |
| 4.3 | 消息队列 | fatal | 立即终止 |
| 4.4 | 外部 API 凭证 | fatal | 立即终止 |

### 5. 制品检查

| # | 检查项 | 级别 | 失败处理 |
|---|--------|------|---------|
| 5.1 | 镜像存在 | fatal | 立即终止 |
| 5.2 | 镜像 checksum 匹配 | fatal | 立即终止 |
| 5.3 | 镜像扫描（漏洞） | warning | 高危阻断 |
| 5.4 | secrets 完整 | fatal | 立即终止 |

### 6. 流程合规

| # | 检查项 | 级别 | 失败处理 |
|---|--------|------|---------|
| 6.1 | 变更窗口 | warning | 高峰需 special approval |
| 6.2 | 审批状态 | fatal（prod） | 立即终止 |
| 6.3 | 备份可用 | fatal | 立即终止 |
| 6.4 | 配置漂移 | warning | 标记 + 通知 |

## 返回格式

```json
{
  "passed": true,
  "fatal_count": 0,
  "warning_count": 1,
  "checks": [
    {
      "id": "env.k8s.api",
      "category": "environment",
      "level": "fatal",
      "status": "passed",
      "message": "K8s API reachable at https://k8s-api.internal:6443",
      "duration_ms": 120
    }
  ]
}
```
