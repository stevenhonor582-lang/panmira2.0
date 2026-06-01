# Runbook: Database Failure（数据库故障）

> 触发关键词：db down / connection pool exhausted / 主从切换 / 慢查询
> 典型严重度：P0（主库）/ P1（从库）

## 症状

- DB 连接失败（连接池耗尽 / connection refused）
- 慢查询激增
- 主从延迟告警
- 复制中断

## 排查步骤

1. **确认 DB 类型**：PostgreSQL / MySQL / Redis / MongoDB
2. **检查主库状态**：`scripts/check-health.sh postgres-master`
3. **查看连接数**：
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
   ```
4. **查看慢查询**：
   ```sql
   SELECT pid, now() - query_start as duration, query
   FROM pg_stat_activity
   WHERE state = 'active' AND now() - query_start > interval '5 seconds';
   ```
5. **查看锁等待**：
   ```sql
   SELECT * FROM pg_locks WHERE NOT granted;
   ```
6. **查看主从延迟**：`SHOW REPLICA STATUS` (MySQL) / `pg_stat_replication` (PG)

## 常见根因

| 根因 | 占比 | 排查信号 |
|------|------|---------|
| 慢查询 | 30% | pg_stat_activity 显示 long query |
| 锁等待 | 20% | pg_locks 显示未授权锁 |
| 连接池耗尽 | 20% | 应用日志 connection timeout |
| 磁盘满 | 10% | df -h 显示 100% |
| 主从切换 | 10% | 复制中断日志 |
| 误操作 | 10% | DROP / DELETE 大量行 |

## 修复动作

### 慢查询

```sql
-- kill 慢查询
SELECT pg_cancel_backend(<pid>);
-- 强制终止
SELECT pg_terminate_backend(<pid>);
```

### 连接池耗尽

```bash
# 临时扩大连接池
kubectl edit configmap <service>-config
# 或重启服务释放连接
```

### 主库故障

1. **激活从库**为新主库
2. **修改应用连接串**指向新主库
3. **通知 DBA** 跟进
4. **不要自动 failover**（人工决策）

### 磁盘满

```bash
# 清理 WAL / archive log
pg_archivecleanup <archivedir> <keep>
# 清理大表
vacuum full <table>;
```

## 验证

1. DB 连接恢复正常
2. 慢查询清零
3. 错误率回到基线
4. 主从同步恢复（如适用）

## 升级

- 主库不可用 → **直接 P0 + 升级 VP**（不可自动决策）
- 数据损坏 / 丢失 → 升级 VP + 法务
- 涉及误删数据 → 立即停止写入 + 联系 DBA + 法务
