# Runbook: Network Issue（网络故障）

> 触发关键词：timeout / 网络超时 / connection reset / DNS 失败 / 502
> 典型严重度：P0（外部服务全断）/ P1（部分网络问题）

## 症状

- HTTP 504 / 502 激增
- TCP 连接超时
- DNS 解析失败
- SSL 握手失败
- 跨地域访问异常

## 排查步骤

1. **确认网络范围**：
   - 内部网络？外部网络？跨 AZ？跨地域？
2. **基础连通性**：
   ```bash
   ping <host>
   traceroute <host>
   mtr <host>
   ```
3. **DNS 检查**：
   ```bash
   dig <domain>
   nslookup <domain>
   ```
4. **端口连通性**：
   ```bash
   telnet <host> <port>
   nc -zv <host> <port>
   ```
5. **SSL 检查**：
   ```bash
   openssl s_client -connect <host>:<port>
   ```
6. **带宽检查**：`iftop` / `nethogs` / 监控带宽图

## 常见根因

| 根因 | 占比 | 排查信号 |
|------|------|---------|
| 上游服务不可用 | 30% | 多个调用方同时告警 |
| DNS 故障 | 15% | dig 解析失败 |
| 防火墙 / 安全组 | 15% | nc 连接被拒 |
| SSL 证书过期 | 10% | openssl 报错 expired |
| 带宽饱和 | 10% | 监控显示带宽 100% |
| BGP / 路由问题 | 10% | traceroute 异常 |
| 跨 AZ / 跨地域问题 | 10% | 单地域 / 单 AZ 异常 |

## 修复动作

### 上游服务不可用

- 启用 fallback / 降级
- 切换到 backup upstream
- 联系上游 oncall

### DNS 故障

```bash
# 临时切到公共 DNS
echo "nameserver 8.8.8.8" > /etc/resolv.conf
# 或修改服务配置
```

### SSL 证书过期

```bash
# 紧急续签
certbot renew --force-renewal
# 或切换到新证书
kubectl create secret tls <name> --cert=... --key=...
```

### 带宽饱和

- 启用流量压缩
- 限流非关键服务
- 扩容带宽

## 验证

1. 连通性恢复
2. 错误率回到基线
3. DNS 解析正常
4. SSL 握手成功

## 升级

- 涉及跨地域 / 多服务 → 升级 oncall 主管
- ISP / 云厂商问题 → 联系云厂商 support + 升级 VP
- DDoS 攻击 → 立即启用 CDN 防护 + 升级安全团队
