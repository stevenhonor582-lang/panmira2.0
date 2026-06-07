---
name: deploy-service
version: 1.0.0
bot_id: shou-jing
layer: 3
status: stable

description: |
  Use when: @守静 说"部署/上线/发布 XX 到 XX 环境 vX.Y.Z"、CI 失败需手动重试部署、用户粘贴 commit hash + "部署"
  Do not use when: 故障修复（升级到 incident-response）、代码评审（升级到 code-review）、监控配置（升级到 monitor-setup）、DB schema 变更（需 DBA 审核）

requires:
  mcp:
    - k8s
    - docker-registry
    - monitoring
  scripts:
    - scripts/preflight-check.sh
    - scripts/build-artifact.sh
    - scripts/deploy-blue-green.sh
    - scripts/deploy-rolling.sh
    - scripts/deploy-canary.sh
    - scripts/health-check.sh
    - scripts/smoke-test.sh
    - scripts/rollback.sh
    - scripts/format-deploy-report.py
  references:
    - references/preflight-checklist.md
    - references/deployment-strategies.md
    - references/rollback-procedures.md
    - references/health-checks.md
    - references/environment-configs.md
    - references/approval-rules.md

resources:
  timeout_ms: 1800000
  max_memory_mb: 1024
  max_concurrent: 2

tags:
  - deployment
  - cicd
  - kubernetes
  - release
  - rollback
---

# Deploy Service

> 自动化部署编排：预检→构建→部署→验证→收尾（5 阶段工作流）
> 所属 Bot：守静 (shou-jing) | Layer 3 | v1.0.0

## 1. 触发条件

### 1.1 触发场景

- 消息包含"部署/上线/发布/deploy/release" + 服务名 + 版本号
- 消息形如"部署 panmira-core v1.5.2 到 prod"
- 用户 @守静 说"把 XX 部署到 XX 环境"
- CI 失败需手动重试部署（带 PR/commit 信息）
- 飞书 webhook 触发（CI/CD 集成）

### 1.2 不触发场景

- 故障/事故修复 → 升级到 `incident-response` skill
- 代码评审 → 升级到 `code-review` skill
- 监控/告警配置 → 升级到 `monitor-setup` skill
- DB schema/DDL 变更 → 需 DBA 审核，独立流程
- 数据迁移 → 提示用户（data-migration skill 尚未实现）

## 2. 核心流程（5 阶段）

```
用户消息: "部署 panmira-core v1.5.2 到 prod"
  ↓
[Clarification] 必填: service, version, environment；prod 还需 approver
  ↓
Stage 1: scripts/preflight-check.sh        → preflight_result
  ├─ 环境/权限/资源/依赖/镜像/secrets 10+ 检查项
  └─ 任何 fatal → 立即终止
  ↓
Stage 2: scripts/build-artifact.sh         → build_result
  ├─ git checkout <version>
  ├─ 跑项目 build (npm/yarn/pip/go)
  ├─ 生成 Docker image + 计算 checksum
  └─ push 到 registry
  ↓
Stage 3: scripts/deploy-<strategy>.sh      → deploy_result
  ├─ 策略：blue-green / rolling / canary（默认 rolling）
  ├─ 预审批（prod 必须）
  ├─ 流量切换（按策略分阶段）
  ├─ 实例健康探针
  └─ 失败 → 自动回滚
  ↓
Stage 4: scripts/health-check.sh + smoke-test.sh → verify_result
  ├─ liveness + readiness 探针
  ├─ 核心 API 冒烟测试（5 固定端点）
  ├─ 业务指标（响应时间/错误率）
  └─ 5min 观察期 + 不通过 → 回滚
  ↓
Stage 5: scripts/format-deploy-report.py   → deploy_report
  ├─ 飞书卡片（部署群通知）
  ├─ 审计日志 runs/<date>/<deploy_id>/
  └─ 失败 → 升级到 incident-response
```

### 2.1 Stage 1: 预检 (preflight)

10+ 检查项全部通过才进入下一阶段：

| # | 检查项 | 失败级别 | 说明 |
|---|--------|---------|------|
| 1 | 目标环境可达 | fatal | K8s API / SSH 连接 |
| 2 | deployer 权限 | fatal | K8s RBAC / SSH key |
| 3 | CPU/内存配额 | warning | 资源利用率 < 80% |
| 4 | 磁盘空间 | fatal | 剩余 > 2GB |
| 5 | 镜像存在性 | fatal | `<service>:<version>` 已 push |
| 6 | secrets 完整 | fatal | DB / API key / TLS cert |
| 7 | 依赖服务状态 | fatal | DB / Redis / MQ 健康 |
| 8 | 变更窗口 | warning | 工作时间需 special approval |
| 9 | 备份状态 | fatal | 上次成功部署的 manifest 可回滚 |
| 10 | 配置漂移检测 | warning | 实际环境与 GitOps 一致性 |
| 11 | 审批（如需） | fatal | prod 必须有 approver 确认 |

读取 `references/preflight-checklist.md` 获取完整规范。

### 2.2 Stage 2: 构建 (build)

1. `git checkout <commit/tag>` 锁定代码版本
2. 检测项目类型（package.json / pyproject.toml / go.mod）
3. 跑对应 build 命令（`npm run build` / `pip install -e .` / `go build`）
4. 生成 Docker image（多阶段构建）
5. 计算 SHA256 checksum
6. 推送到内部 registry（`registry.internal/<service>:<version>`）
7. 记录 build_id + image_digest

### 2.3 Stage 3: 部署 (deploy)

**策略选择**（读取 `references/deployment-strategies.md`）：

| 策略 | 适用场景 | 切换时间 | 风险 |
|------|---------|---------|------|
| **rolling**（默认） | 普通迭代发布 | < 1min | 中 |
| **blue-green** | 重大变更/DB schema | 立即 | 高（资源×2） |
| **canary** | 灰度验证 | 10min+ | 低 |

**prod 必走审批**（读取 `references/approval-rules.md`）：
- dev → 自动
- staging → Tech Lead
- prod → CIO/CEO + 变更窗口外需 special approval

**失败处理**：流量切换 / 实例探针任意失败 → 立即触发自动回滚。

### 2.4 Stage 4: 验证 (verify)

1. **liveness 探针**：`/healthz` 200 OK
2. **readiness 探针**：`/readyz` 200 OK 且依赖服务连通
3. **冒烟测试**：跑 `scripts/smoke-test.sh` 5 个固定端点
4. **业务指标**：错误率 < 0.1%、P99 < SLO
5. **5min 观察期**：持续无异常判定成功

读取 `references/health-checks.md` 获取探针规范。

### 2.5 Stage 5: 收尾 (post)

1. `scripts/format-deploy-report.py <result>` → Markdown 报告
2. 飞书卡片发到部署群（成功/失败/回滚状态）
3. 审计日志写入 `runs/<YYYY-MM-DD>/<deploy_id>/exec.log`
4. 部署状态写入 `state/<deploy_id>.json`
5. **失败升级**：进入 `incident-response` skill 处理

## 3. 边界规则

| # | 规则 | 触发后行为 |
|---|------|-----------|
| 1 | prod 环境单人禁止操作 | 缺 approver → 立即终止 + 飞书通知 |
| 2 | 预检 fatal > 0 | 立即终止 + 不进入 build 阶段 |
| 3 | 备份失败 | 立即终止（无备份不部署） |
| 4 | 健康检查失败 | 立即回滚（不等用户） |
| 5 | 超过 3 次连续回滚 | 暂停 + 升级人工 |
| 6 | 变更窗口外（9:00-18:00） | prod 需 special approval |
| 7 | 涉及 DB DDL | 必须 DBA 复核 + 独立流程 |
| 8 | 不删旧版本 | 保留 7 天，支持回滚 |
| 9 | 不直接改 DB schema | 需 DDL 审核流程 |
| 10 | 涉及数据迁移 | 升级到 data-migration（未实现，提示用户） |

## 4. 文件读取时机

| 阶段 | 读取文件 | 用途 |
|------|---------|------|
| Stage 1 预检 | `references/preflight-checklist.md` | 10+ 检查项详细说明 |
| Stage 3 部署 | `references/deployment-strategies.md` | 蓝绿/滚动/金丝雀对比 |
| Stage 3 审批 | `references/approval-rules.md` | dev/staging/prod 审批人 |
| Stage 3 环境 | `references/environment-configs.md` | 三个环境差异 |
| Stage 4 验证 | `references/health-checks.md` | 探针规范与阈值 |
| Stage 5 回滚 | `references/rollback-procedures.md` | 回滚决策树与流程 |

## 5. 脚本调用时机

| 阶段 | 命令 | 输入 | 输出 |
|------|------|------|------|
| Stage 1 | `scripts/preflight-check.sh` | service, env | JSON: checks[] |
| Stage 2 | `scripts/build-artifact.sh <version>` | version | JSON: build_id, image_digest |
| Stage 3 | `scripts/deploy-rolling.sh <config>` | 部署配置 | JSON: deploy_status |
| Stage 3 | `scripts/deploy-blue-green.sh <config>` | 部署配置 | JSON: deploy_status |
| Stage 3 | `scripts/deploy-canary.sh <config>` | 部署配置 + 比例 | JSON: deploy_status |
| Stage 4 | `scripts/health-check.sh <url>` | URL | JSON: health_report |
| Stage 4 | `scripts/smoke-test.sh <service> <env>` | service+env | JSON: smoke_report |
| 回滚 | `scripts/rollback.sh <deploy_id>` | deploy_id | JSON: rollback_status |
| Stage 5 | `scripts/format-deploy-report.py` | 完整 result JSON | Markdown 报告 |

### 5.1 脚本返回约定

- 成功：stdout 输出 JSON，exit code = 0
- 失败：stderr 输出错误，exit code ≠ 0
- 部署命令 **mock**（不实际执行 kubectl/docker）

## 6. 验收标准

| # | 指标 | 目标 | 测量 |
|---|------|------|------|
| 1 | 部署成功率（健康） | ≥ 99% | 月度统计 |
| 2 | 部署 P50 耗时 | < 5min | Stage 1→5 计时 |
| 3 | 部署 P99 耗时 | < 15min | 计时 |
| 4 | 回滚触发准确率 | 100% | 健康失败必触发 |
| 5 | 审计日志完整率 | 100% | 月度审计 |
| 6 | 审批绕过次数 | 0 | 月度审计 |
| 7 | 健康检查误报率 | < 5% | 已知正常部署 |
| 8 | 备份成功率 | 100% | 月度统计 |
| 9 | 预检漏报率 | < 1% | 故障注入测试 |

## 7. 失败处理

| 失败场景 | 处理 |
|---------|------|
| 预检 fatal | 立即终止 + 飞书通知 deployer |
| 审批缺失/超时 | 暂停 + 飞书催审 + 30min 后取消 |
| 构建失败 | 记录 build_id + 退出码 + 不进入部署 |
| K8s API 401/403 | 检查 kubeconfig 权限 |
| 镜像拉取失败 | 验证 registry 凭证 + 重试 1 次 |
| 健康检查超时 | 触发自动回滚 + 通知 oncall |
| 冒烟测试失败 | 触发自动回滚 + 标记 P1 |
| 回滚失败 | 升级到 incident-response（最高优先级） |
| 5+ 次连续回滚 | 暂停 skill，强制人工介入 |

## 8. 扩展

- **多服务支持**：当前支持 panmira-core/portal/mcp + custom，可扩展
- **多策略组合**：canary + 蓝绿混合模式（先 canary 验证再切换）
- **集成 Argo Rollouts**：未来可对接 GitOps 平台
- **金丝雀指标**：可对接 Prometheus 自动化金丝雀决策
- **数据迁移**：未来 `data-migration` skill 可与本 skill 联动
