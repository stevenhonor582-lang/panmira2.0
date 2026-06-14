# Panmira Desktop — 本地开发指南

> 让改一行代码 → 5 秒内看到结果，不用远程 CI 编译 .exe。

## 🎯 三种开发流

| 流 | 何时用 | 反馈速度 |
|---|---|---|
| **A. 本地 dev 模式**（推荐）| 改代码看效果 | **秒级**（HMR + main 自动重启）|
| B. 跑测试 | 验证逻辑 | 几秒 |
| C. 远程 CI 打 .exe | 装到 Windows 跑 | 4-5 分钟 |

下面重点讲 **A**。

---

## A. 本地 dev 模式（推荐）

### 前置

- **Node.js 22.x** — [下载](https://nodejs.org/) 或 `nvm install 22`
- **Git** — 已装
- **操作系统**: macOS / Linux / Windows 都能跑（v0.2.0 在 macOS + Windows 测过；Linux 需要 `apt install libgtk-3-0 libnss3 xvfb` for Electron 启动）

### 一次性 setup

```bash
git clone https://github.com/stevenhonor582-lang/panmira.git
cd panmira/desktop
npm install
```

`npm install` 会装：electron、playwright、sqlite-vec、react、vite、tsx、vitest、concurrently、wait-on、cross-env。约 1-2 分钟。

### 启动 dev 模式

```bash
cd desktop
npm run dev:all
```

这条命令同时启动 **3 个进程**：

| 进程 | 命令 | 端口/作用 |
|---|---|---|
| vite (renderer) | `vite` | http://localhost:5173，HMR 改 React 秒级刷新 |
| tsx watch (main) | `tsx watch src/main/index.ts` | main process 改代码自动重启 |
| electron | `wait-on tcp:5173 && electron .` | 等 vite 起来后启动 electron，加载 `http://localhost:5173` |

**第一个 terminal 看到 3 个分栏输出。** 改任何 `src/` 下的文件 → vite HMR 或 main 重启。

### 验证

1. Electron 窗口弹出
2. 顶部看到 4 个 tab：Chat / Templates / Browser / KB
3. 点 Templates → 看到 7 个模板卡片
4. 按 `Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Option+I` (macOS) → DevTools 打开
   - Console tab 看 renderer 日志
   - Sources tab 加断点
   - Application → Local Storage 看 zustand state

### 改代码并测

```bash
# 改 renderer React 组件
vim src/renderer/pages/TemplatesPage.tsx
# vite HMR 自动刷新，秒级看到变化 ✨

# 改 main process
vim src/main/templates/template-runner.ts
# tsx watch 检测到 → 重启 main → electron 自动重连
# terminal 看到 "main process restarted" 日志

# 改 preload (context-bridge)
vim src/preload/context-bridge.ts
# 完整重启 electron (Ctrl+C 整个 dev:all，重启)
```

### 常见问题

| 问题 | 解法 |
|---|---|
| `Error: Cannot find module '../types.js'` | main tsc 编译没跑。停 dev 跑 `npm run build:main` 然后重启 |
| 改了 main 进程没生效 | tsx watch 偶尔卡住 → Ctrl+C 重启 `npm run dev:all` |
| vite 报 `EADDRINUSE :::5173` | 别的进程占 5173 端口。`lsof -ti:5173 \| xargs kill -9` |
| electron 启动后白屏 | 等 vite 编译完（首次 1-2 秒）。F12 Console 看错 |
| main 进程 import 错 | main 跑的是 src/main/index.ts，TypeScript 实时编译。**重启 electron** 让 Node 重新加载 |

### 单进程启动（高级）

有时只要看 renderer：

```bash
# 只看 renderer
npm run dev:renderer
# 浏览器开 http://localhost:5173 (Electron 不启)
```

只测 main process 逻辑：

```bash
# 跑测试
npm test
# 跑单个文件
npx vitest run src/main/templates/__tests__/template-runner.test.ts
```

---

## B. 跑测试

```bash
# 全部测试
npm test

# 单文件
npx vitest run src/renderer/pages/__tests__/TemplatesPage.test.tsx

# watch 模式（改测试即跑）
npx vitest watch
```

测试文件位置：`*/__tests__/*.test.{ts,tsx}`。

---

## C. 远程 CI 打 .exe（只在 release 时用）

CI 在 `.github/workflows/desktop-release.yml` 配置。触发：

```bash
# 你 push tag desktop-vX.Y.Z 时
git tag desktop-v0.2.0
git push origin desktop-v0.2.0
# CI 跑 4-5 分钟，artifact 下载链接在 GitHub Actions 页面
```

正常开发 **不需要这个**。本地 dev 模式 + 测试够了。

---

## 📋 调试技巧

### 1. main process 日志

dev 模式下 main process 跟 vite/tsx 输出在 **同一个 terminal**：

```
[main] listening on http://...
[vite] ready in 234ms
[electron] Renderer loaded
[main] IPC: templates:list called
```

加 `console.log(...)` 立刻看到。

### 2. renderer 日志

按 `Ctrl+Shift+I` 开 DevTools → Console tab。React 组件的 `console.log` 直接显示。

### 3. 断点

DevTools Sources tab → `webpack://` 找到 `src/renderer/...` 文件 → 行号点一下设断点。React 19 + vite HMR 兼容断点。

main process 断点：在 DevTools 切到 Node 图标（顶部 tab "///"）— 但只对 main 跑 dev tool 时有效。常规 dev 不支持。

### 4. userData 路径

Electron 数据存在：

| OS | 路径 |
|---|---|
| Windows | `%APPDATA%\Panmira\` (`C:\Users\<you>\AppData\Roaming\Panmira\`) |
| macOS | `~/Library/Application Support/Panmira/` |
| Linux | `~/.config/Panmira/` |

**重要**：本地 dev 模式和打包 .exe 装**会共用 userData**。测试时如果想"全新环境"，删 `Panmira/` 整个目录。

### 5. 看 dist 是否最新

偶尔 dev 模式表现奇怪（e.g. require 路径找不到）：

```bash
# 重新生成 dist
rm -rf dist
npm run build:main
npm run build:preload
npm run build:renderer
```

---

## 🚀 快速复现 v0.2 bug 修复

如果你想重现 "preload 编译覆盖 main 输出" 那个 bug：

```bash
# 1. main tsc (emit dist/main ESM)
npx tsc -p tsconfig.main.json
head -3 dist/main/templates/types.js
# 输出：/** ... */ ← ESM

# 2. preload tsc (如果不 exclude shared，**会**覆盖)
npx tsc -p tsconfig.preload.json
head -3 dist/main/templates/types.js
# 输出："use strict"; ← 变 CJS 了，坏了
```

修复在 `tsconfig.preload.json`：`include: ["src/preload/**/*"]`（不 include shared）。

---

## 📞 反馈问题

发现 bug：

1. 跑 `npm test` 看是否已有测试覆盖
2. 如果是 main process 错，开 DevTools + 看 terminal main 日志
3. 如果是 renderer 错，DevTools Console
4. 把错误日志 + 复现步骤发我

不需要远程打 .exe 就能反馈。
