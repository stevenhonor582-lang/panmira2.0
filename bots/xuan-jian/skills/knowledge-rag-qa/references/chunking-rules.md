# 文档切片规则

## 默认参数

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| max_chunk_size | 500 字符 | 200-2000 | 单 chunk 最大长度 |
| overlap | 50 字符 | 0-200 | 相邻 chunk 重叠 |
| min_chunk_size | 50 字符 | 20-100 | 短于该值合并到上一块 |

## 切片策略

### 优先级

1. **标题边界**：`# / ## / ###` 段落优先作为切片点
2. **段落边界**：双换行 `\n\n` 作为次优切片点
3. **句子边界**：中文句号 `。` / 英文句号 `.` + 空格
4. **强制切片**：超长段按 max_chunk_size 强制切

### 不切分单元

- 代码块（```...```）必须完整保留在单 chunk
- 表格行（`|...|`）保留完整行
- 列表项（`- / 1.`）保留完整项
- Markdown 链接 `[text](url)` 完整保留

## 特殊处理

### 中文文本

- 按字符切分，不按字节
- 中文标点（，。；：）作为句子边界

### 代码块

```
# 检测 ``` 开始/结束
if line.startswith("```"):
    in_code = not in_code
    current_chunk.append(line)
    if not in_code and len(current_chunk) > max_chunk_size:
        flush()
        continue
```

### 表格

- 按行切，不按列
- 表头必须与首行内容在同一 chunk

## Chunk 元数据

每个 chunk 携带：

```json
{
  "chunk_id": "doc-001#chunk-003",
  "source_id": "doc-001",
  "chunk_index": 3,
  "text": "...",
  "domain": "tech-docs",
  "tags": ["api", "auth"],
  "created_at": "2026-05-15T10:00:00Z"
}
```

## 失败处理

- 编码错误 → 跳过该 chunk，记录 warning
- 文档为空 → 跳过，不入库
- 文档超长（> 100k 字符）→ 按 max_chunk_size 切，记录 debug
