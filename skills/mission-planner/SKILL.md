---
name: mission-planner
description: >
  任务编排引擎。将复合任务拆解为子任务，自动匹配最佳技能，
  带质量门禁的端到端执行。支持轻量模式（L2）和完整模式（L3）。
---

# Mission Planner — 任务编排引擎

## 何时触发

- 由 task-router 路由过来
- 用户直接要求多步骤任务

## 两种模式

### 轻量模式（L2）

用户需求明确，直接匹配技能并执行。
- 不做深度需求分析
- 最多1轮确认
- 串行执行1-3个技能

### 完整模式（L3）

需要深入理解需求后编排多个技能。
- 先收集完整需求（2-3轮问答）
- 生成详细计划并确认
- 支持并行执行
- 多级质检

---

## 工作流程

### 轻量模式流程

```
1. 从用户消息提取：交付物类型 + 关键信息
2. 在 skill-registry.yaml 中匹配技能
3. 展示计划，等待确认
4. 按序执行，每步报告
5. 交付
```

### 完整模式流程

```
1. 收集任务简报（goal + deliverables + constraints + success_criteria）
2. 拆解为原子子任务（每个子任务 = 一个技能可完成）
3. 匹配技能 + 检查依赖 + 降级策略
4. 生成执行计划（步骤 + 输入输出 + 质量门禁 + 并行组）
5. 展示计划，等待确认
6. 逐步执行，每步质检
7. 最终验证 + 交付
```

---

## 任务简报格式

```
TASK_BRIEF:
  goal: [一句话目标]
  deliverables: [交付物1, 交付物2, ...]
  audience: [受众]
  constraints: [约束1, 约束2, ...]
  success_criteria: [标准1, 标准2, ...]
```

---

## 子任务拆解格式

```
SUBTASKS:
  - id: T1
    name: [子任务名]
    type: [research/writing/visual/document/knowledge/development]
    input: [输入内容 或 @T0.output]
    output: [预期产出]
    depends_on: [依赖的子任务ID列表]
    parallel_group: [并行组号，同组可并行]
```

---

## 技能匹配规则

读取 skill-registry.yaml，按以下顺序匹配：

1. 按 type + 具体需求 匹配能力标签
2. 检查该技能的依赖是否满足（API Key、工具）
3. 依赖不满足 → 查 fallback 链
4. fallback 也不满足 → 标注为"需降级"，简化任务范围

---

## 执行计划格式

```
EXECUTION_PLAN:
  name: [任务名]
  total_steps: N

  step_1:
    skill: [技能名]
    input: [输入]
    expected_output: [预期产出]
    quality_gate: [质检项列表]
    on_fail: [失败策略]
    parallel_group: null  # 或组号

  step_2:
    ...
```

---

## 执行规则

1. 按步骤顺序执行
2. 同一 parallel_group 的步骤用并行Agent执行
3. 每步完成后运行该技能的质量门禁
4. 质检通过 → 进入下一步
5. 质检失败 → 重试1次 → 换备选技能 → 暂停报告用户
6. 每步完成后简短报告进度

---

## 进度报告格式

```
✅ Step 1/N: [技能名] — 完成
   产出: [简要描述]
   质检: 通过/失败

⏳ Step 2/N: [技能名] — 进行中...
```

---

## 最终交付格式

```
📊 任务完成: [任务名]

交付物:
  1. [交付物1]
  2. [交付物2]

质量:
  ✅ [技能1] 质量门禁通过
  ✅ [技能2] 质量门禁通过
  ✅ 跨步骤数据一致
```

---

## 降级策略

| 情况 | 处理 |
|------|------|
| 技能API不可用 | 查fallback链 |
| 无可用备选 | 跳过该步骤，报告用户 |
| 质检失败2次 | 暂停，请用户决策 |
| 步骤间数据不一致 | 回到最早不一致的步骤修正 |
| 子任务超过8个 | 建议用户拆成多个独立任务 |

---

## 典型编排模板

### 行业研究报告
```
T1: market-research("行业名") → 决策备忘录
T2: article-writing(@T1) → 完整报告
T3: frontend-slides(@T2) → HTML演示
T4: knowledge-ops(存档)
```

### 产品发布材料
```
T1: market-research("产品定位") → 市场分析
T2: brand-voice(品牌素材) → 语调档案
T3: article-writing(@T1,@T2) → 产品文案
T4a: content-engine(@T3) → 多平台内容    ┐ 并行
T4b: frontend-slides(@T3) → 演示文稿     ├ 并行
T4c: fal-ai-media("产品图") → 宣传图     ┘ 并行
T5: crosspost(@T4a) → 跨平台分发
```

### 竞品分析
```
T1: market-research("竞品名") → 竞品分析
T2: article-writing(@T1) → 分析报告
T3: frontend-slides(@T2) → 汇报PPT
```

### 融资材料
```
T1: market-research("赛道分析") → 市场数据
T2: investor-materials(@T1) → BP+一页纸+财务模型
T3: frontend-slides(@T2) → 路演演示
T4: investor-outreach(@T2) → 触达邮件模板
```

### 技术选型方案
```
T1: research-ops("技术对比") → 路由到合适研究深度
T2: article-writing(@T1) → 选型报告
T3: frontend-slides(@T2) → 汇报PPT
```
