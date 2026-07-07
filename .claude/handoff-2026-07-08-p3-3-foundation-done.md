# Handoff · 2026-07-08 · P3.3 数智底座模块 (/foundation) DONE

> 模型: MiniMax-M3 (512K)
> 范围: P3.3 完整实现,不动 A1/A2/A3

## 1. 交付物

**8 个文件,2295 行新代码,1 commit**:

```
apps/web-next/app/(app)/foundation/
├── page.tsx                            # 默认 redirect → /foundation/memory/l1
├── memory/
│   ├── layout.tsx                      # 共享 3-pane: tree | content | contract
│   ├── l1/page.tsx                     # L1 短期记忆 (24h 上下文)
│   ├── l2/page.tsx                     # L2 长期记忆 (事实 · 标签 · importance)
│   └── l3/page.tsx                     # L3 永久记忆 (Iron laws timeline)
├── knowledge/page.tsx                  # 3-pane KB browser (tree | list | preview)
├── extraction/page.tsx                 # 5 worker + 5 extractor + event stream + pipeline
└── feedback/page.tsx                   # 反馈列表 + thread + 状态流转
```

git: `bf2e788 feat(web): P3.3 数智底座模块 (/foundation) - 3 层记忆 + KB 3-pane`

## 2. 设计语言遵循

- **3-pane finder**:memory layout + knowledge 浏览器都用了 (tree | list | preview) 三栏
- **不堆表格**:KB 浏览器有递归 FolderTree,8 个 KB 类型 8 种语义色
- **不统一圆角**:tree 用 4-6px,container 用 8px,文件行无圆角
- **typography hierarchy**:`text-[10px] uppercase tracking-wider font-mono` 给 meta,`text-sm font-medium` 给 row title
- **数据密度**:list 行带 multi-line preview + meta,不是单行
- **零 emoji**:全程用 lucide icons,大小精准 (size-2.5/3/3.5)
- **restraint**:empty state 直接 `—`,placeholder 用 `font-mono uppercase`

## 3. 路由验证 (dev mode)

```
GET /foundation/                    → 200  (redirect → /foundation/memory/l1)
GET /foundation/memory/l1/          → 200
GET /foundation/memory/l2/          → 200
GET /foundation/memory/l3/          → 200
GET /foundation/knowledge/          → 200
GET /foundation/extraction/         → 200
GET /foundation/feedback/           → 200
```

(注:目前用 dev mode 跑,因为 build 在 TS check 阶段撞上 tasks/page.tsx 的预存在 TS 错误,与 P3.3 无关,详见 §5)

## 4. 实现亮点

### memory/layout.tsx (共享 layout)
- 3 列 grid:260px tree | flex content | 320px contract
- 左侧:layer 树 + pipeline summary (L1→L2 auto / L2→L3 manual / L3→ never)
- 右侧:写入规则 + 查询路径 + 监控 DL (代码风格)
- 顶栏 breadcrumb + L1/L2/L3 badge

### memory/l1 - 短期记忆 (24h)
- filter bar:search + 来源 + 60s 轮询
- 列表:bot · preview · turns · TTL · pinned
- 详情:conversation excerpt (user/assistant 双色 mono) + memory meta + pin/promote/discard

### memory/l2 - 长期事实
- tag chip filter bar (动态提取)
- 列表:importance 0.82 + hits 47 + tags + source provenance
- 详情:facts 完整 statement + provenance + linked records + edit/promote/delete

### memory/l3 - Iron laws timeline
- 垂直 timeline rail (左竖线 + 节点圆点)
- 5 个 bot × N 个 iron law,每条带 v(version) + revision log
- 底部:警告框 + 双签流程提示

### knowledge - 3-pane finder
- 左:9 大类 8 KB 类型,递归展开,黄色 Folder icon
- 中:list/grid view 切换,sort by updated/title/size
- 右:文档 preview + tags + content (mono) + chunk list + indexing meta

### extraction - 状态仪表盘
- 4 worker cards (running=绿边, paused=黄边, stopped=灰)
- 5 extractor rows (progress bar + eta)
- live event stream (5s poll · tail -f 风格)
- 8 节点 pipeline diagram:interaction → extract → score → L1 → promote → L2 → audit → L3

### feedback - 反馈工作台
- status 3 列 stat tiles
- 双 filter (status × type) + 全文搜索
- 列表:type/status badge + reporter + bot + layer + votes
- 详情:type · status · meta · thread (user/ops/system 三色) · state actions

## 5. 待修复 (不在 P3.3 范围)

`pnpm build` (turbopack) 在 TypeScript check 阶段撞到 1 个预存在错误:

```
./app/(app)/tasks/page.tsx:197:37
Type 'Dispatch<SetStateAction<string>>' is not assignable to type
'(value: string | null, eventDetails: SelectRootChangeEventDetails) => void'
```

这是 P3.4 (任务协作) 范围内的预存在代码,与 P3.3 数智底座无关。
下次 P3.4 agent 处理:
- `tasks/page.tsx` 把 `setBotFilter` 类型从 `string` 改为 `string | null`
- 或 Select 用 `onValueChange={(v) => setBotFilter(v ?? "")}` 适配 base-ui strict 类型

## 6. 当前 pm2 状态

```
43 │ web-next │ online │ next dev (pid 3504928) -H 127.0.0.1 -p 3200
40 │ panmira  │ online │ dist/index.js (pid 3471322)
```

dev mode 是临时方案 (因为 production build 被 §5 TS 错误阻挡)。P3.4 修完 TS 后,需要 `next build && pm2 reload web-next` 切回 production。

## 7. 用户偏好 / 约束 (强制)

- ✅ 直接干,不问 A/B/C
- ✅ 不动 A1/A2/A3 baseline (app/layout.tsx, (app)/, components/layout/, components/theme/, next.config.ts)
- ✅ 不写 emoji
- ✅ L1/L2/L3 共享 layout (已实现)
- ✅ KB 不用单表堆 2526 docs (已用 3-pane + FolderTree)
- ✅ finder 风格 + data-density (已用 mono meta + uppercase tracking)

## 8. 下次启动

1. 读这份 handoff
2. P3.4 agent 先修 §5 的 TS 错误
3. `cd apps/web-next && pnpm build && pm2 reload web-next` 切回 production
4. foundation 路由继续 P3.5 / 真实 API 集成