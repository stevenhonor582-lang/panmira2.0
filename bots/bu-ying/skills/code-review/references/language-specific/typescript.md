# TypeScript 评审重点

> 评审 AI 在 Step 5 读取本文件，针对 TS/TSX 代码应用语言特定检查。

## 类型系统

- [ ] **避免 `any`**：用 `unknown` + 类型守卫替代
- [ ] **避免 `as` 强制转换**：用类型守卫 / zod 校验
- [ ] **`strict: true`**：tsconfig 必须开启
- [ ] **避免 `!` 非空断言**：改用条件检查或显式错误
- [ ] **泛型约束**：`<T extends ...>` 明确边界

## Promise / 异步

- [ ] **不丢 Promise**：`async` 函数未 `await` 不会阻塞
- [ ] **不混用 `.then` + `await`**：保持风格统一
- [ ] **错误处理**：try/catch 包裹，catch 块不要留空
- [ ] **并发控制**：`Promise.all` / `Promise.allSettled` 选择合适
- [ ] **避免 async 回调地狱**：超过 3 层 await 应拆分

## React（TSX）

- [ ] **`useEffect` 依赖**：deps 数组必须完整
- [ ] **`useState` 初始值**：惰性初始化用函数形式
- [ ] **`useMemo` / `useCallback` 滥用**：避免无意义包装
- [ ] **key prop**：列表渲染必须稳定 key（不用 index）
- [ ] **避免直接修改 state**：始终用 setState

## 导入 / 导出

- [ ] **避免 `default export`**：用 named export（可重构友好）
- [ ] **避免 `import * as`**：具名导入
- [ ] **循环依赖**：检测并消除

## 错误处理

- [ ] **Result 类型**：用 `Result<T, E>` 替代异常（关键路径）
- [ ] **错误边界**：React 组件配 ErrorBoundary
- [ ] **类型化错误**：`instanceof Error` 检查，自定义错误类型

## 性能

- [ ] **避免内联对象/函数**：`onClick={() => ...}` 在循环里导致重渲
- [ ] **大列表虚拟化**：react-window / react-virtual
- [ ] **Tree-shaking 友好**：避免 `import { x } from 'lodash'`

## 工具与库

- [ ] **避免 `console.log`**：用 logger
- [ ] **`process.env` 类型**：用 `@types/node` 或显式声明
- [ ] **Date 处理**：用 `date-fns` / `dayjs` 而非原生 Date

## 项目配置

- [ ] **tsconfig.json**：`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [ ] **ESLint**：开启 `@typescript-eslint/recommended-type-checked`
- [ ] **Prettier**：统一格式，避免团队争议
