# 健康检查规范

> liveness / readiness / startup 三大探针的规范与阈值。

## 探针类型

### Liveness（存活探针）
- **目的**：容器是否活着（死锁/内存泄漏检测）
- **失败行为**：K8s 重启 Pod
- **检查频率**：每 10s
- **超时**：1s
- **失败阈值**：3 次
- **端点**：`GET /healthz` → 200 OK
- **响应体**：`{"status":"alive","uptime_s":3600}`

### Readiness（就绪探针）
- **目的**：Pod 是否可以接受流量
- **失败行为**：从 Service endpoints 移除
- **检查频率**：每 5s
- **超时**：2s
- **失败阈值**：3 次
- **端点**：`GET /readyz` → 200 OK
- **响应体**：`{"status":"ready","deps":{"db":"ok","cache":"ok","mq":"ok"}}`

### Startup（启动探针）
- **目的**：慢启动应用给更多时间
- **失败行为**：在通过前不进行 liveness/readiness 检查
- **检查频率**：每 10s
- **超时**：5s
- **失败阈值**：30 次（5min）
- **端点**：`GET /healthz` → 200 OK

## 业务指标阈值

| 指标 | 阈值 | 触发动作 |
|------|------|---------|
| 错误率（5xx / 总请求） | < 0.1% | > 1% 持续 1min → 回滚 |
| P99 延迟 | < SLO（服务定义） | 超阈值 2x → 告警 |
| CPU 使用率 | < 80% | 持续 5min → 告警 |
| 内存使用率 | < 85% | 持续 5min → 告警 |
| 请求 QPS | 在基线 ±30% 内 | 异常 → 告警 |

## 健康检查脚本行为

`scripts/health-check.sh` 行为：
1. 连续 3 次 GET `/healthz`，间隔 1s
2. 连续 3 次 GET `/readyz`，间隔 1s
3. 任一失败 → exit 1
4. 通过 → 输出 JSON health_report

## 冒烟测试规范

`scripts/smoke-test.sh` 跑 5 个固定端点：

1. `GET /` → 首页 200
2. `GET /api/v1/health` → 健康检查 200
3. `GET /api/v1/version` → 版本号 200
4. `POST /api/v1/auth/login` → 测试登录 200
5. `GET /api/v1/users/me` → 当前用户 200

每个端点超时 5s，失败 1 个即视为冒烟失败。
