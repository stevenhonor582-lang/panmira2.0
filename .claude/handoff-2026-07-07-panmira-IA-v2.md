# IA v2 重构完成 · Handoff (2026-07-07)

## 当前任务
按管理员工作流程重构侧栏 IA(不再按"管什么"模块分类),加 5 个新页面,清理混乱的双 worktree 编辑。

## 已完成

### 1. 决策:**唯一工作目录**
- ✅ pm2 web-next 改跑**主仓库**(`/home/ubuntu/panmira`),不再依赖 N1 worktree
- ✅ 所有改动只在主仓库一份
- N1 worktree 现在只用作 git remote 推送的临时区

### 2. IA v2 结构(6 组,按管理员工作流程)

| 组 | 内容 | 用途 |
|---|---|---|
| 🎛️ 控制台 | Dashboard / 预警 / 诊断 | 登录后第一屏 |
| 🤖 Bot 工作室 | Bot列表 / 对话日志 / Runtime / Agent蓝图 | 70% 时间在这 |
| 📚 数智与记忆 | KB总览 / 公共 / 员工 / 项目 / Embedding | KB 类单独成组 |
| 🔌 资源池 | 模型池 / Skill+MCP | 独立配置 |
| 📊 运营 | Channel / 报表 / 成本 / 审计 | 复盘场景 |
| ⚙️ 系统 | OAuth / 权限 / Bots / Projects / DAG / 协调 / Chain / Memory / Voice / 设置 | 后台 |

### 3. 5 个新页面

| 路径 | 内容 | 后端 |
|---|---|---|
| `/bots/conversations/` | 全 Bot 对话日志,全局搜索,30s 轮询 | GET /runtime/sessions |
| `/kb/public/` | 公共记忆 (KB type=company) | GET /knowledge-bases?type=company |
| `/kb/agents/` | 数字员工记忆 (type=personal) | GET /knowledge-bases?type=personal |
| `/kb/projects/` | 项目记忆 (type=department) | GET /knowledge-bases?type=department |
| `/kb/embedding/` | Embedding Provider 配置 | GET /embedding-providers |

### 4. 改进
- Runtime Console 从"监控"组移到"Bot 工作室"(内聚)
- Skill DAG 从"系统"组保留(独立配置)
- Bot 实例管理(`/settings/bots`) 跟 Bot 列表(`/agents`)分开,前者管实例,后者管模板

## Git 状态
- **main HEAD**: `572d7497 merge: IA v2 restructure - 6 workflow groups + 5 new admin pages`
- **fix/memory-system HEAD**: `df1eab78 feat(admin): IA v2 restructure` (已 merge 到 main)
- 全部 push 到 origin

## 部署
- pm2 web-next PID 37 online, 跑主仓库 3200 端口
- build 成功 28 路由
- E2E 测试 12 个路由全部 200

## 浏览器验证
1. https://deepx.fun/web-next/login/
2. 左侧栏现在分 6 组,带 emoji 图标
3. **🎛️ 控制台** → 总览/预警/诊断
4. **🤖 Bot 工作室** → Bot列表/对话日志/Runtime/Agent蓝图(都有 NEW 徽章)
5. **📚 数智与记忆** → KB总览/3类记忆(NEW)/Embedding
6. **🔌 资源池** → 模型池/Skill+MCP
7. **📊 运营** → Channel/报表/成本/审计
8. **⚙️ 系统** → OAuth/权限/Bots/Projects/Skill DAG/...

## 下一步
- [A] 浏览器验证 IA v2 看起来对吗
- [B] 添加测试数据(在 KB 里建一个 public KB,看是否能在 公共记忆页看到)
- [C] Feishu session 管理(之前你说最后修)
- [D] DAG 可视化画布(react-flow)
