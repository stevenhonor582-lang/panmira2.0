---
name: vmt-module-verification
description: "P2质审: 模块标准验证——按模块操作手册每个模块的验证checklist逐项核对"
user_invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 模块标准验证

## 功能边界
按VMT模块生成操作手册中每个模块的"验证标准"checklist逐项核对。

## 各模块核心验证项

### M01 Hero
```
□ 标题4-10词,含主关键词
□ 副标题1句话,有具体差异化(不是形容词堆砌)
□ CTA含动词+时间承诺
□ 信任徽章3-4个,数据可验证
□ 主视觉是真实产品/车间照片
```

### M02 TrustSignals
```
□ 3-5个信号,覆盖≥3个维度
□ 每个数据可溯源自知识底座
□ 每个信号有图标
□ 不出现模糊形容词
```

### M04 TechSpecs
```
□ 参数分2-4个类别
□ 每个参数: 名称+值+单位+Typical/Max标注
□ 数值全部可溯源至R4-技术库
□ 总数≤12行
```

### M06 CaseStudy
```
□ 挑战+方案+效果三段式
□ 挑战有具体参数
□ 效果有≥3个量化指标
□ 有真实零件照片
```

### M11 FAQ
```
□ 8-15个问题(产品页)/6-10个(文章页)
□ 覆盖: 价格/交期/技术/流程/物流/起订量中≥6类
□ 答案≤80词+行动引导
□ Schema.org FAQPage标记
```

## 输出
```json
{
  "moduleVerification": {
    "pageUrl": "/services/cnc-aluminum-machining/",
    "modules": [
      { "module": "M01", "checksPassed": 6, "checksTotal": 7, "failedItem": "CTA缺少时间承诺", "status": "FAIL" },
      { "module": "M02", "checksPassed": 6, "checksTotal": 6, "status": "PASS" },
      { "module": "M04", "checksPassed": 4, "checksTotal": 5, "failedItem": "2个参数缺少Typical/Max标注", "status": "FAIL" }
    ],
    "overallVerdict": "FAIL",
    "action": "M01和M04退回修改"
  }
}
```

## 关键规则
1. 全部模块PASS才算通过
2. 任一模块FAIL→退回内容生产师修改该模块
3. 退回时标注哪个验证项没通过
