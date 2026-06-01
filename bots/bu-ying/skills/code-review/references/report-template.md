# 评审报告模板 (Markdown)

> scripts/format-report.py 套用本模板。占位符由 AI 评估结果填充。

---

## 报告结构

```markdown
# Code Review Report

- **PR**: {{pr_url}}
- **生成时间**: {{generated_at}}
- **文件数**: {{files_reviewed}} | **变更行数**: {{lines_changed}}
- **评审耗时**: {{review_duration_s}}s
- **置信度**: {{confidence}}  {{#if confidence < 0.7}}⚠️ 待人工复核{{/if}}

## 严重度总览

| P0 | P1 | P2 | P3 |
|----|----|----|----|
| {{p0}} | {{p1}} | {{p2}} | {{p3}} |

## 必改项 (Must Fix)

{{#each must_fix}}
- **[{{severity}}]** `{{file}}:{{line}}` — {{message}} {{#if rule}}`[rule: {{rule}}]`{{/if}}
{{/each}}
{{#if must_fix.length == 0}}
无
{{/if}}

## 建议项 (Suggestions)

{{#each suggestions}}
- **[{{severity}}]** `{{file}}:{{line}}` — {{message}} {{#if rule}}`[rule: {{rule}}]`{{/if}}
{{/each}}
{{#if suggestions.length == 0}}
无
{{/if}}

## 安全检查

{{security_notes}}

## 性能影响

{{performance_notes}}

## 测试覆盖

- 覆盖率基线: {{base_coverage}}%
- 覆盖率当前: {{head_coverage}}%
- 变化: {{delta}}%

## 评审总结

{{summary}}

---

> ⚠️ 业务逻辑正确性须由人工确认。本报告仅评估代码层面的安全性、可读性、性能等维度。
```

---

## 字段说明

| 字段 | 来源 | 必填 |
|------|------|------|
| `pr_url` | schema.json input | 是 |
| `files_reviewed` | diff-parser 统计 | 是 |
| `lines_changed` | diff-parser 统计 | 是 |
| `review_duration_s` | Step 1→8 计时器 | 是 |
| `confidence` | AI 评估 | 是 |
| `must_fix` | AI 评估（schema: P0/P1/P2） | 是 |
| `suggestions` | AI 评估（schema: P3/INFO） | 是 |
| `severity_summary` | must_fix + suggestions 汇总 | 是 |
| `security_notes` | AI 评估安全维度 | 否 |
| `performance_notes` | AI 评估性能维度 | 否 |
| `base_coverage / head_coverage / delta` | coverage-check.py | 否 |

---

## 风格要求

- 总长度 < 200 行
- 必改项必须含文件路径 + 行号 + 严重度
- 安全 / 性能如有发现，单独成段
- 末尾必须有免责声明
