---
name: vmt-info-collection
description: "P1知识管理: 从竞品站/内部文档/客户邮件/认证文件/案例记录采集原始信息"
user-invocable: false
context: fork
allowed-tools: Read, Write, WebFetch, Bash
---

# VMT 信息采集与预处理

## 功能边界
从各种来源采集原始信息，预处理为标准Markdown格式，标注元数据。

## 信息来源优先级
1. VMT内部技术文档(一手，最高可信度)
2. 竞品网站页面内容(一手，高可信度)
3. 认证文件/检测报告(一手，高可信度)
4. 客户邮件FAQ(一手，需脱敏)
5. 行业标准/规范(权威来源)
6. 行业报告(二手，需标注来源)

## 输出格式
每条信息的标准格式:
```markdown
---
source: "VMT内部技术文档 - CNC加工能力表.xlsx"
collected_at: "2026-05-26"
credibility: "primary"
category: "process-capability"
tags: ["cnc-milling", "tolerance", "aluminum"]
---

## CNC铣削精度能力
- 线性公差: ±0.005mm (Typical), ±0.002mm (Max,需评审)
- 设备: Haas VF-4, DMG MORI DMU 50 (5轴)
- ...
```

## 元数据标注规范
- source: 完整来源路径或URL
- collected_at: ISO日期
- credibility: primary(一手) / secondary(二手,可交叉验证) / speculative(推测,需标注)
- category: 对应知识库分类
- tags: 便于检索的标签

## 关键规则
1. 每条信息标注来源+采集日期+可信度
2. speculative级别的信息必须标注"待验证"
3. 竞品信息标注竞品名+采集URL
4. 客户信息必须脱敏(不暴露客户名/公司名)
