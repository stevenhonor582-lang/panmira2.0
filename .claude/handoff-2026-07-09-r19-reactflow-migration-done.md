# 会话交接 - 2026-07-09 R19 React Flow 迁移完成

## 当前任务
把任务编排画布从 tldraw v5 → React Flow (@xyflow/react),消除 license 提示 + 水印,保留全部功能。

## 已完成
- [x] types.ts 重写: DagDocument.snapshot 改 RF `{nodes, edges}` 格式 + NodeRunStatus + tone/label map
- [x] node-shapes.tsx 重写: tldraw BaseBoxShapeUtil → React Flow DagNode custom node + NODE_TYPES
  - 6 类节点共用一组件,KIND_ICON / KIND_LABEL / TONE 表驱动
  - Conditional 双 source handle(id="true" 绿 / id="false" 红)
  - runtime status pill + approval pill + 选中环 (primary/sky/amber/rose/emerald)
  - buildSeedRecords(template → RF nodes/edges)
- [x] task-dag-editor.tsx 完全重写
  - ReactFlowProvider + ReactFlow + Background + Controls + MiniMap
  - 左 palette:点击 + 拖拽 (onDrop + screenToFlowPosition)
  - 顶 toolbar:撤销/重做/缩小/放大/网格/适应/校验 badge/保存/测试运行
  - history 栈 50 步,⌘Z / ⇧⌘Z / Delete 键盘快捷键
  - onConnect: isConnectionAllowed + 重复边 + 环检测三段验证
  - 只读模式 (variant="viewer" || readOnly): nodesDraggable=false + nodesConnectable=false
  - normaliseInitialDoc: RF 格式直接用 / DagDocument 包装剥离 / 旧 tldraw flat lists grid 重排 / 不可解析的 tldraw snapshot 显示空画布
- [x] shape-config-panel.tsx: 透传 R18 运行上下文 (runId/pipelineId/nodeId) 给 HumanApprovalCard
- [x] globals.css: 删 .tl-watermark-unlicensed 隐藏规则 (RF 无水印)
- [x] templates.ts: 注释 tldraw → React Flow 描述更新
- [x] r17-4-canvas-smoke.spec.ts: 选择器 .tl-container → .react-flow,断言无 tldraw 残留
- [x] r19-connect.spec.ts: 新增 e2e,验证加 2 节点 + handles + 无水印 + 无 console error
- [x] 卸载 tldraw ^5.2.3 (npm uninstall,2907 行 lockfile 减)
- [x] 2 次 next build 通过 (含 + 不含 tldraw),0 残留 import
- [x] pm2 reload web-next
- [x] git: 3 commit ff-merge 到 main
  - 87a64e2 feat(web): R19 (1) 核心重写
  - c0c851f chore(web): R19 (2) 清理 tldraw 残留 + 适配 smoke
  - 7735aa5 chore(web): R19 (3) 卸载 tldraw
- [x] main HEAD: 7735aa5

## 验证
- ✅ npx next build: ✓ Compiled successfully in 23.1s (64/64 静态页)
- ✅ pm2 web-next reload 成功,HTTP 308 (login redirect) 正常
- ✅ playwright r17-4-canvas-smoke.spec.ts: 1 passed (2.6s)
  - .react-flow 画布挂载
  - 无 .tl-container / .tl-watermark-unlicensed 残留
  - 加 Bot 节点 → .react-flow__node [data-kind="bot"] 可见
  - 0 console error
- ✅ playwright r19-connect.spec.ts: 1 passed (1.8s)
  - 加 Bot + Skill 两节点都可见
  - .react-flow__handle 渲染 (≥4 个,2 per node)
  - 0 tldraw 水印 / .tl-container
  - 0 console error

## 关键决策 / 约束
- **不动后端**: pipeline.config JSON 格式兼容。新 RF snapshot = `{nodes: DagRfNode[], edges: DagRfEdge[]}`,同时保留派生 flat lists `nodes: DagNodeRecord[]` + `edges: DagEdgeRecord[]` 给服务端用
- **旧 tldraw TLStoreSnapshot 不解析**: panmira pre-production 没有真实数据用此格式持久化过。normaliseInitialDoc 走 fallback 链:RF doc → DagDocument 包装 → flat lists grid 重排 → 空画布
- **Conditional 双 source handle**: id="true" (top-right, emerald) + id="false" (bottom-right, rose),视觉上 T/F 标签提示
- **Undo/Redo 自实现**: React Flow 12 不内置。past/future 栈 50 步,只在结构性改变 (addNode/deleteSelected/onConnect/pushHistory) 时 snapshot,位置拖动不记录
- **License 隐藏**: proOptions={{ hideAttribution: true }} 是 React Flow 官方支持的合法选项(MIT 协议,无水印无强制归属)
- **dag-validators.ts 完全不动**: isConnectionAllowed / detectCycle / validateDag 都是纯函数,接收 (nodes, edges),RF 编辑器直接复用

## 用户偏好 / 风格
- 不要 license 提示 → 选 MIT 协议的 React Flow
- 保功能:6 节点 / 配置面板 / 连线验证 / 工具栏 / save/load / Human 审批 / 只读 / IOContractCard / 测试运行 / 实时高亮 — 全部迁移

## 重要文件 / 路径
- `/home/ubuntu/panmira-N1/apps/web-next/components/tasks/types.ts`
- `/home/ubuntu/panmira-N1/apps/web-next/components/tasks/node-shapes.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/components/tasks/task-dag-editor.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/components/tasks/shape-config-panel.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/components/tasks/dag-validators.ts` (未动)
- `/home/ubuntu/panmira-N1/apps/web-next/components/tasks/templates.ts` (注释更新)
- `/home/ubuntu/panmira-N1/apps/web-next/app/globals.css` (删水印)
- `/home/ubuntu/panmira-N1/apps/web-next/e2e/specs/r17-4-canvas-smoke.spec.ts`
- `/home/ubuntu/panmira-N1/apps/web-next/e2e/specs/r19-connect.spec.ts` (新增)
- 生产: http://127.0.0.1:3200/tasks/new (panmira-N1 @ 43.135.149.34)

## 待办 / 遗留
- [ ] 手动浏览器跑一遍 /tasks/new + /tasks/[id] viewer 全流程(自动化已覆盖核心交互,但人工复检 Conditional 双出边 / Parallel fan-out 视觉表现)
- [ ] 可选:把 task-dag-editor.tsx 里 `parallelismFromNodes` 接到 ShapeConfigPanel 改 degree 的实时回写(目前 parallel degree 改了不立即触发 validation 重算,但 memoized validationMsg 会因 nodes 变更触发,已 OK)
- [ ] 可选:旧 tldraw snapshot 真的存过的话,写一个 migration 脚本提取节点。目前判断数据库里没有
- [ ] 可选:删 feat/r19-reactflow-migration 分支(main 已 ff-merge)

## 下次开始会通过 SessionStart hook 自动读这个文件继续
