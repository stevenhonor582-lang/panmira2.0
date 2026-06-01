# 审批规则

> 部署审批的完整规则：谁批、批什么、怎么批、批多久。

## 审批人矩阵

| 环境 | 审批人 | 飞书 user_id | 备选审批人 |
|------|--------|------------|------------|
| dev | （无需审批） | - | - |
| staging | Tech Lead | `tech_lead_feishu_id` | `cto_feishu_id` |
| prod | CIO 或 CEO | `cio_feishu_id` | `ceo_feishu_id` |
| prod（DB DDL） | DBA + CIO | `dba_feishu_id` + `cio_feishu_id` | - |

## 审批流程

### 1. 发起审批

deployer 触发部署后，系统自动向审批人发送飞书卡片：

```
[部署审批] 待审批
- 服务: metabot-core
- 版本: v1.5.2
- 环境: prod
- 策略: canary
- 变更窗口: 22:00-09:00
- 发起人: @steven

[批准] [拒绝] [查看详情]
```

### 2. 等待响应

- **staging**：30min 超时自动取消
- **prod**：2h 超时自动取消
- deployer 可主动催审（重新发卡片）

### 3. 审批决策

| 决策 | 行为 |
|------|------|
| 批准 | 进入 Stage 2 构建 |
| 拒绝 | 终止部署 + 通知 deployer |
| 超时 | 自动取消 + 通知 deployer + 审批人 |
| 撤回 | deployer 主动取消（审批前） |

## 特殊规则

### 1. 变更窗口外（prod）

工作日 9:00-18:00 部署 prod 需 `special approval`：
- 审批人：CIO
- 必须备注：紧急原因 + 补偿措施
- 失败时升级 P0 事故

### 2. DB DDL 变更

- **必须**双重审批：DBA + CIO
- DBA 审核 SQL 安全性（无锁表/无大事务）
- CIO 审核业务必要性
- 建议低峰期执行（周末凌晨）

### 3. 高风险变更

- 涉及金额/合规/隐私数据
- 灰度发布强制 5% → 25% → 50% → 100% 四阶段
- 每阶段观察 10min

### 4. 回滚审批

自动回滚无需审批（健康检查失败触发）。
人工回滚需当前 deployer 或 oncall 确认。

## 审计要求

每次审批记录：
- 审批人飞书 user_id
- 审批时间（精确到秒）
- 审批决策（批准/拒绝）
- 备注（可选）
- 飞书消息 ID（用于回溯）

存储：`runs/<date>/<deploy_id>/approval.json`
