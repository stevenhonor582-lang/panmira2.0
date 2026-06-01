# Python 评审重点

> 评审 AI 在 Step 5 读取本文件，针对 Python 代码应用语言特定检查。

## 类型与可读性

- [ ] **类型注解**：公共函数必须有 type hints
- [ ] **避免 `Any`**：用 `Unknown` 模式（`cast` + 守卫）
- [ ] **`Optional[T]` 等价 `T | None`**：选一种保持一致
- [ ] **dataclass 优先**：替代裸字典做数据容器
- [ ] **避免 mutable default**：`def f(x=[])` → `def f(x=None): x = x or []`

## 控制流

- [ ] **`with` 语句**：文件 / 锁 / 连接必须用 context manager
- [ ] **`is` vs `==`**：None / 布尔用 `is`，其他用 `==`
- [ ] **`for ... else`**：仅当团队熟识时使用
- [ ] **EAFP vs LBYL**：优先 EAFP（try/except），但避免吞所有异常

## 异常处理

- [ ] **不要 `except:`**：至少 `except Exception:`
- [ ] **不要 `except: pass`**：要么处理，要么重抛
- [ ] **捕获具体异常**：`except ValueError` 而非 `except Exception`
- [ ] **重新 raise**：`raise NewError(...) from e` 保留 traceback
- [ ] **自定义异常**：业务错误继承 `Exception` 或自定义基类

## 性能

- [ ] **避免循环里查询 DB**：用 `executemany` / 批量 ORM 操作
- [ ] **列表推导 vs `map`**：推导式更 Pythonic
- [ ] **生成器**：`yield` 替代大列表
- [ ] **`lru_cache`**：纯函数可用 functools 缓存
- [ ] **字符串拼接**：`''.join(parts)` 优于 `+=`

## 导入与模块

- [ ] **绝对导入**：避免相对导入（`from . import x`）
- [ ] **导入顺序**：stdlib / third-party / local（PEP 8）
- [ ] **避免 `import *`**：污染命名空间
- [ ] **避免循环导入**：重构或延迟导入

## 资源管理

- [ ] **文件操作**：用 `with open(...) as f`
- [ ] **数据库连接**：用 connection pool
- [ ] **线程 / 进程**：`concurrent.futures` 优于裸 `threading`
- [ ] **异步**：`asyncio.create_task` 必须持有引用

## 序列化与数据

- [ ] **`json.loads` 返回 `Any`**：解析后做类型校验（pydantic）
- [ ] **`pickle` 风险**：不可信输入不要 pickle
- [ ] **f-string 优于 `%` 和 `.format()`**

## 测试

- [ ] **`pytest` fixture**：避免全局 setup/teardown
- [ ] **`parametrize`**：多场景用一个函数
- [ ] **mock 外部依赖**：`unittest.mock`，不 mock 内部逻辑
- [ ] **覆盖率**：核心模块 > 80%

## 项目配置

- [ ] **`pyproject.toml`**：替代 setup.py
- [ ] **虚拟环境**：`venv` / `uv` / `poetry`，不污染全局
- [ ] **lint**：`ruff` 优先（比 flake8 + isort + black 快）
- [ ] **格式化**：`black` 或 `ruff format`
- [ ] **类型检查**：`mypy --strict` 或 `pyright`
