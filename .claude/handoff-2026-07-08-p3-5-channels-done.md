# 会话交接 - P3.5 资源频道模块 (/channels) - 2026-07-08

## 当前任务
实现 IA v6 P3.5 资源频道模块 — 6 个子页面:LMM / Skills / MCP / Endpoints (双向) / OAuth (双向) / Routing。

## 已完成
- [x] 共享底层:`lib/channels/{types.ts, mock.ts}` (类型 + mock 数据)
- [x] 共享组件:`components/channels/{channels-subnav.tsx, page-shell.tsx, dense-table.tsx, status-pill.tsx, oauth-secret-modal.tsx}`
- [x] /channels/layout.tsx (内嵌 dense-config 子导航)
- [x] /channels/page.tsx (default redirect → /channels/llm)
- [x] /channels/llm/page.tsx (5 个 provider + 测速 + 编辑 credential,type=password)
- [x] /channels/skills/page.tsx (6 个 skill,搜索 + 标签 + source 过滤 + toggle)
- [x] /channels/mcp/page.tsx (4 个 MCP server,transport + 启动/停止 + 编辑)
- [x] /channels/endpoints/page.tsx (Outbound 飞书/钉钉/企微 双向 + Inbound 回调端点,tabs 双向)
- [x] /channels/oauth/page.tsx (Consumer (我们接别人) + Provider (别人接我们) 双向 + secret 一次显示 modal)
- [x] /channels/routing/page.tsx (4 条规则 + 拖拽排序 + JSON probe 测试)
- [x] 删除老 `(admin)/channels` 路由(移到 `(admin)/channels.bak.p3.5`),避免路径冲突
- [x] 编译通过(`pnpm build` 全部完成,channels 6 个 page.js 全部产出)
- [x] pm2 重启 web-next (PID 49,online)
- [x] 6 路由 HTTP 200 全部验证
- [x] Git commit:c031508

## 验证结果

```
$ for path in channels channels/llm channels/skills channels/mcp channels/endpoints channels/oauth channels/routing; do
    curl -s -o /dev/null -w "%{http_code}\n" -L "http://127.0.0.1:3200/$path/"
  done
/channels/ → 200
/channels/llm/ → 200
/channels/skills/ → 200
/channels/mcp/ → 200
/channels/endpoints/ → 200
/channels/oauth/ → 200
/channels/routing/ → 200
```

build artifacts:
```
.next/server/app/(app)/channels/
├── endpoints/   llm/   mcp/   oauth/   routing/   skills/
└── page.js (default redirect → /channels/llm)
```

## 设计原则 (Design Read)

> B2B 资源频道中心 for admin,偏 dense-config 风格,tailwind utilities + Geist Mono + restraint chrome + tab + table 混排

- 不用 shadcn 默认 8px 圆角,改用 4px / `rounded-sm`
- 表格用 `rounded-sm` + `ring-1` 而非 `rounded-xl` + shadow
- Mono 字体给 id / url / model / token;Sans 给 prose
- 状态点 4-tone (ok / warn / err / muted / info),无 emoji
- 标题区:小写 mono `meta` + dense key-value 列
- Toolbar 与 PageMeta 同区,左右双栏 (col-span-3 meta + col-span-9 content)
- Routing 页 8/4 分栏:左表,右 probe panel

## 关键决策 / 约束

### OAuth 秘密处理 (核心安全要求)
- `client_secret` 明文**只**在 `OAuthSecretModal` 显示一次
- 创建/轮换时:`setReveal(...)` 写入 React state,关闭/确认后立即 `setReveal(null)`
- List 表格中**绝不**显示 secret,只显示 client_id
- 复制按钮触发 `navigator.clipboard.writeText`,有 try/catch 兼容剪贴板被拒
- Rotate 操作生成新 secret 并触发同一个 modal(行为一致)

### Endpoints 双向 (A2 字段)
- 顶 tab:`Outbound · 我们接别人` / `Inbound · 别人接我们`
- 表格数据由 `bot_configs.purpose` 字段(A2 新加)分区
- 飞书/钉钉/企微 webhook URL token 段永远显示 `***`

### LLM 模型池
- 5 个 provider 卡片:openai / anthropic / google / local / deepseek
- Status:connected / expired / error / needs-api-key(4 tone)
- API key 字段 `type="password"`,提交后立刻从 form state 清除
- 测速按钮模拟 PATCH /api/providers/{id}/test(待接后端)
- 顶 status 点:绿/橙/红 + default 角标

### Skills
- 6 个 skill mock (built-in / github / local / custom 各类型)
- 顶 search + source filter 切换 + 增 GitHub 装
- Toggle 直接生效(无 confirm dialog)

### MCP
- stdio / sse / http 三种 transport
- 启停后自动 `tools/list` 探测 tool count
- Auth 字段显示 `Bearer ***` 永远不回显
- 添加 modal 含 transport select (Select primitive)

### Routing
- 4 条规则 mock,priority 1/2/3/99 (99 = `*` fallback)
- 上/下箭头按钮 swap 相邻 priority 并 sort
- 添加规则 dialog:priority / bot / condition / destination
- Probe panel:粘贴 JSON → 测试 → 找到第一条 enabled 且 condition 匹配

## 关键文件 / 路径

| 文件 | 说明 |
|------|------|
| `apps/web-next/lib/channels/types.ts` | 6 个接口 + 4 个 union 类型 |
| `apps/web-next/lib/channels/mock.ts` | 5 LLM + 6 Skill + 4 MCP + 3 OB + 3 IB + 2 Auth + 2 Client + 4 Rule |
| `apps/web-next/components/channels/channels-subnav.tsx` | 6 tab + 移动端 fallback row |
| `apps/web-next/components/channels/page-shell.tsx` | `ChannelsPageShell` + `PageMeta` 组件 |
| `apps/web-next/components/channels/dense-table.tsx` | `DenseTable` + `MonoCell` + `KeyCell` |
| `apps/web-next/components/channels/status-pill.tsx` | 5-tone `StatusPill` + 4 个 tone 选择器 |
| `apps/web-next/components/channels/oauth-secret-modal.tsx` | 一次性 secret 显示 modal |
| `apps/web-next/app/(app)/channels/layout.tsx` | Subnav 包装 + -m-6 覆盖 AppShell p-6 |
| `apps/web-next/app/(app)/channels/page.tsx` | default redirect |
| `apps/web-next/app/(app)/channels/llm/page.tsx` | LLM 模型池 + 测速 + 编辑 credential |
| `apps/web-next/app/(app)/channels/skills/page.tsx` | Skills + 搜索 + 过滤 + toggle |
| `apps/web-next/app/(app)/channels/mcp/page.tsx` | MCP + 启停 + 添加/编辑 |
| `apps/web-next/app/(app)/channels/endpoints/page.tsx` | Endpoints 双向 tab |
| `apps/web-next/app/(app)/channels/oauth/page.tsx` | OAuth 双向 + secret 一次显示 |
| `apps/web-next/app/(app)/channels/routing/page.tsx` | Routing + 排序 + probe |
| `apps/web-next/app/(admin)/channels.bak.p3.5/` | 老 v1 channels 路由(已停用) |

## 待办 / 后续

- [ ] 接后端 API:LMM → `GET /api/providers` + `POST /api/providers/test`;Skills → `GET /api/skills`;MCP → `GET /api/v2/admin/mcp_servers`;OAuth → `GET /api/oauth/clients` + `POST /api/oauth/clients` + `POST /api/oauth/clients/{id}/rotate-secret`
- [ ] bot_configs.purpose 字段过滤:在 Endpoints 页面 wire 上,只显示 `purpose IN ('outbound','both')` 的 bot
- [ ] Routing condition 表达式:接真实表达式引擎(目前仅支持 `== / && / || / *`)
- [ ] Sidebar 已含 channels 6 tab → P3.5 nav 完整对齐
- [ ] 老 `(admin)/channels.bak.p3.5` 后续可删除(确认无引用后)

## 用户偏好 / 风格

- 不动 A1/A2/A3 (backend / data / frontend baseline) — channels 是 IA v6 新模块
- 圆角 4px (不用 8px 默认)
- Geist Mono 配 id / url / token
- Status tone 统一:ok=绿 / warn=橙 / err=红 / muted=灰 / info=蓝
- 状态点 1.5px 圆,无动画
- client_secret 安全:**绝不在** list / log / 截图 / 协作工具停留
- 设计原则以 design-taste-frontend skill 0.0 节 + 用户指定 `dense-config` 为准

## 重要设计参考

`~/.claude/skills/design-taste-frontend/SKILL.md` 第 1 行声明:
> Design Read: Reading this as: B2B 资源频道中心 for admin,偏 dense-config 风格,tailwind utilities + Geist Mono + restraint chrome + tab + table 混排

按 dense-config 风格执行:**无空 gradient、无 hero、无 animation hero、无 giant card grids**。

## 验证命令

```bash
# Routes
for path in channels channels/llm channels/skills channels/mcp channels/endpoints channels/oauth channels/routing; do
  curl -s -o /dev/null -w "%{http_code} /$path/\n" -L "http://127.0.0.1:3200/$path/"
done

# Build artifacts
ls /home/ubuntu/panmira-N1/apps/web-next/.next/server/app/\(app\)/channels/

# PM2
pm2 list | grep web-next
```

## HEAD
- c031508 (P3.5 channels 提交)
- 0bc7ae2 (P3.4 任务协作 — handoff only)
- c0a73ff (IA v6 骨架 baseline)

## 验证结论

- 6 路由 200 OK ✓
- 编译 EXIT=0 ✓
- pm2 web-next online ✓
- 双向 tab (endpoints / oauth) 全部展示 ✓
- client_secret 仅在 modal 显一次,关闭即丢 ✓
- 严格不修改 A1/A2/A3 baseline ✓
