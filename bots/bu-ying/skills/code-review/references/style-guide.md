# 团队代码风格指南

> 跨语言通用原则。三语言特定要点见 `language-specific/` 目录。

## 核心原则

1. **简单优先**：能用标准库就别引第三方
2. **明确优于隐式**：避免魔法，类型/参数应清晰
3. **小步提交**：单次 commit < 500 行
4. **测试先行**：核心逻辑必须可测试
5. **文档同步**：改代码同时改文档

## 命名规范

| 类型 | 风格 | 示例 |
|------|------|------|
| 变量 | 小驼峰 / 蛇形（按语言） | `userName` / `user_name` |
| 常量 | 全大写 + 下划线 | `MAX_RETRY` |
| 函数 | 动词开头 | `getUserById` / `fetch_user` |
| 类 | 大驼峰 | `UserService` |
| 文件 | 与主类同名 | `user_service.py` |

## 函数规范

- 一个函数只做一件事
- 函数体不超过 30 行
- 参数不超过 3 个（超过用对象）
- 早返回（guard clause），避免深嵌套
- 副作用明确（标记为 `// side effect` 注释或单独函数）

## 错误处理

- **不要吞异常**：要么处理，要么抛出
- **错误信息包含上下文**：缺哪个文件、哪个参数
- **可重试错误与不可重试错误区分**：返回明确错误码
- **用户可见错误友好**：内部细节只记日志

## 日志规范

- **级别**：ERROR（需要人工介入）/ WARN（需关注）/ INFO（关键路径）/ DEBUG（调试）
- **结构化**：JSON 或 key=value，方便检索
- **禁止**：密码、token、PII 写入日志
- **时间戳**：ISO 8601 + 时区

## Git 提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

- type: feat / fix / refactor / test / docs / chore / perf
- subject: 50 字内，祈使句
- body: 解释 why，不是 what
- footer: 关联 issue / breaking change

## 评审规范

- 评论聚焦"为什么"而非"是什么"
- 区分 must-fix（必须改）和 nice-to-have（建议）
- 涉及安全/性能必须 P0/P1
- 不在 PR 评论中讨论架构（升级到 ADR）
