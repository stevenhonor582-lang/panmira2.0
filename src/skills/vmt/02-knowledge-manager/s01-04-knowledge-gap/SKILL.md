---
name: vmt-knowledge-gap
description: "P1知识管理: 对比内容生产需要的信息与知识底座已有信息，识别并管理知识缺口"
user-invocable: false
context: fork
allowed-tools: Read, Write, Grep
---

# VMT 知识缺口管理

## 功能边界
当内容策略师发起新建站需求时，检查知识底座覆盖度，识别并管理缺口。

## 触发时机
1. 选品策略师输出新的选品推荐 → 检查新品类知识覆盖度
2. 内容策略师发起页面建设 → 检查目标页面所需知识是否齐全
3. 客服反馈无法回答的问题 → 检查客服FAQ覆盖度

## 输出
```json
{
  "gapReport": {
    "trigger": "新建铝散热器产品页",
    "gaps": [{
      "missingInfo": "VMT铝散热器加工案例",
      "neededBy": "M06 CaseStudy模块",
      "priority": "P0",
      "suggestedSource": "内部项目记录/客户反馈"
    }, {
      "missingInfo": "散热器表面处理对比数据",
      "neededBy": "M08 SurfaceFinish模块",
      "priority": "P1",
      "suggestedSource": "R4-技术库补充/供应商资料"
    }],
    "readyModules": ["M01 Hero", "M02 TrustSignals", "M04 TechSpecs"],
    "blockedModules": ["M06 CaseStudy", "M08 SurfaceFinish"]
  }
}
```

## 优先级定义
- P0(阻塞): 缺失此信息→对应模块无法生成 → 立即补充
- P1(降级): 缺失此信息→模块可用默认数据但质量下降 → 优先补充
- P2(增强): 缺失此信息→模块正常但缺少亮点 → 后续补充

## 关键规则
1. 缺口按阻塞程度排序
2. 每个缺口标注: 需要什么+哪个模块需要+怎么获取
3. 也列出"已就绪"的模块，让内容生产师知道哪些可以先做
