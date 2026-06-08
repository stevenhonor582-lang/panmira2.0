# Go 评审重点

> 评审 AI 在 Step 5 读取本文件，针对 Go 代码应用语言特定检查。

## 并发

- [ ] **goroutine 泄漏**：必须有明确的退出机制（context / done channel）
- [ ] **channel 关闭**：发送方关闭，不要接收方关闭
- [ ] **`sync.WaitGroup`**：避免用 `time.Sleep` 同步
- [ ] **race condition**：`go test -race` 必须通过
- [ ] **mutex 选择**：临界区用 `sync.Mutex`，读多用 `sync.RWMutex`

## 错误处理

- [ ] **不忽略错误**：`_, _ = f()` 几乎总是不对
- [ ] **错误包装**：`fmt.Errorf("...: %w", err)` 保留链
- [ ] **`errors.Is` / `errors.As`**：不要用 `==` 或字符串比较
- [ ] **sentinel error**：用 `var ErrXxx = errors.New(...)`
- [ ] **panic 范围**：仅在不可恢复的初始化错误用 panic，业务逻辑用 error

## Context

- [ ] **第一参数**：context 作为函数第一参数（`ctx context.Context`）
- [ ] **传递 context**：不要 `context.Background()` 替换传入 ctx
- [ ] **超时控制**：`context.WithTimeout` / `WithDeadline`
- [ ] **取消传播**：select-case 监听 ctx.Done()

## 接口设计

- [ ] **小接口**：接口方法数 ≤ 3（"the bigger the interface, the weaker the abstraction"）
- [ ] **accept interfaces, return structs**：参数用接口，返回具体类型
- [ ] **接口隔离**：避免胖接口，按使用方定义（consumer-defined）
- [ ] **空接口 `any` 慎用**：仅在 marshal/unmarshal 边界

## 内存与性能

- [ ] **避免不必要的堆分配**：大对象用值接收 / sync.Pool
- [ ] **slice 预分配**：`make([]T, 0, n)` 已知大小时
- [ ] **字符串拼接**：`strings.Builder` 优于 `+=`
- [ ] **defer 性能**：高频路径避免 defer（开销 ~50ns）
- [ ] **指针 vs 值**：大结构体用指针，小结构体或基本类型用值

## 资源管理

- [ ] **defer 关闭**：文件、连接、锁的释放
- [ ] **defer 顺序**：LIFO，最后 defer 的先执行
- [ ] **defer 闭包参数**：传值避免延迟求值

## 包设计

- [ ] **包名简洁**：小写、单词、不混合（不要 util/common）
- [ ] **internal 包**：限制外部导入
- [ ] **init 函数**：慎用，测试困难
- [ ] **循环依赖**：编译错误，提示需重构

## 测试

- [ ] **表驱动测试**：`for _, tc := range tests` 模式
- [ ] **t.Helper()**：辅助函数标记
- [ ] **t.Parallel()**：独立测试并行化
- [ ] **benchmark**：`func BenchmarkXxx(b *testing.B)`
- [ ] **example 测试**：`// Output:` 注释

## 项目配置

- [ ] **`go.mod`**：明确 Go 版本（`go 1.22`）
- [ ] **`go vet`**：CI 必须运行
- [ ] **`golangci-lint`**：替代多个独立 linter
- [ ] **`gofmt` / `goimports`**：必须应用
- [ ] **错误信息**：小写，句子结束无标点（Effective Go）
