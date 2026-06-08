# Runbook: Service Down（服务完全不可用）

> 触发关键词：down / 挂了 / 不可用 / connection refused / health check failed
> 典型严重度：P0

## 症状

- 健康检查失败（HTTP 5xx / connection refused / 超时）
- 监控显示 service_up == 0
- 多个调用方同时告警

## 排查步骤

1. **确认范围**：`scripts/check-health.sh` 拉所有相关服务
2. **查看进程**：检查服务进程是否存活
   ```bash
   ssh <host> "systemctl status <service> || ps aux | grep <service>"
   ```
3. **查看日志**：`scripts/fetch-logs.py <service> error` 拉最近错误日志
4. **查看最近部署**：检查过去 1h 是否有 deploy
5. **查看资源**：CPU / 内存 / 磁盘 / 网络
6. **查看依赖**：数据库 / 缓存 / 上下游服务

## 常见根因

| 根因 | 占比 | 排查信号 |
|------|------|---------|
| 进程崩溃 | 40% | systemctl status 显示 failed |
| OOM 被杀 | 25% | dmesg 显示 Out of memory |
| 部署失败 | 20% | deploy log 显示错误 |
| 依赖不可用 | 15% | 上下游服务同时告警 |

## 修复动作

### 立即修复（按顺序尝试）

1. **重启服务**（最常见有效手段）
   ```bash
   ssh <host> "systemctl restart <service>"
   ```
2. **回滚部署**（如最近有 deploy）
   ```bash
   # 触发 deploy-service skill 回滚
   ```
3. **扩容 / 重启**（资源耗尽时）
4. **启用 backup**（如配置了 backup system）

### 注意事项

- 重启前先保存现场（dump 内存 / 拉日志）
- 回滚前先确认回滚版本健康
- 扩容前先确认资源池有余量

## 验证

1. 健康检查返回 200
2. 错误率回到基线
3. P99 延迟回到基线
4. 持续观察 30min 无新告警

## 升级

- 重启无效 → 升级到 oncall 主管
- 找不到根因 → 升级到工程 VP
- 数据库主库 down → 直接升级到工程 VP
