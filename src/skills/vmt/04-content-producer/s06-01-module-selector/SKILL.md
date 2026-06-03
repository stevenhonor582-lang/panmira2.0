---
name: vmt-module-selector
description: "P2内容生产: 模块选择引擎——根据页面类型和关键词自动判定A/B/C层模块组合"
user-invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 模块选择引擎

## 功能边界
根据页面类型(产品页/文章页)+关键词意图，从M00-M13模块库中选择适用模块组合。

## 输入
- 页面类型 + 目标关键词 + 内容策略
- 竞品模块频率数据

## 模块选择规则

### 产品页/服务页
- 必备(A层): M01 + M02 + M03 + M04 + M12
- 推荐(B层): + M05 + M06 + M07 + M11
- 可选(C层): + M08 + M09 + M10

### 产品详情页(单品/垂直品类)
- 必备: M01 + M02 + M04 + M06 + M12
- 推荐: + M05 + M08 + M11
- 可选: + M09 + M10

### 文章页
按模板类型:
- A-FAQ驱动型: M00 → 问答体正文 → M11 → M13
- B-工艺解构型: M00 → 是什么/有哪些/怎么做/怎么选/陷阱 → M11 → M13
- C-行业垂直型: M00 → 行业需求/典型零件/匹配工艺/合规 → M11 → M13
- D-对比矩阵型: M00 → 方案A/B/C独立对比+总结表+决策树 → M11 → M13

## 输出
```json
{
  "modulePlan": {
    "pageType": "service",
    "selectedModules": ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M11", "M12"],
    "assemblyOrder": ["M01→M02→M03→M04→M05→M06→M07→M11→M12"],
    "rhythmMap": { "M01": "relaxed", "M02": "light", "M03": "relaxed", "M04": "dense", "M05": "dense", "M06": "relaxed", "M07": "medium", "M11": "relaxed", "M12": "light" },
    "rationale": "M05和M06之间插入M11作为缓冲不理想,建议在M05(MaterialSelector密集)后接M06(CaseStudy舒缓)作为节奏切换"
  }
}
```

## 关键规则
1. 🔴密集模块(TechSpecs/MaterialSelector)之间必须有🟢舒缓模块做缓冲
2. 如果某个模块的知识底座数据缺失→标记为"待补充"+降级处理
3. 模块总数≤11个(产品页) 或 ≤6个(文章页)
