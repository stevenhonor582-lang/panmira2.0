---
name: vmt-ai-smell-check
description: "P2质审: AI味检测——按10项清单逐项检测,任一不通过退回修改"
user_invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT AI味检测

## 功能边界
对生成内容执行AI味检测,按10项清单逐项审核,全部通过才算合格。

## 10项检测清单
```
1. □ "In today's rapidly evolving..." → 直接删除,从具体场景开始
2. □ "game-changer/revolutionary/cutting-edge" → 删除,替换为具体描述
3. □ "we pride ourselves on/we are committed to" → 删除,改为事实陈述
4. □ 超过25词的句子 → 拆成两句
5. □ 连续3个形容词修饰一个名词 → 保留1个或全删
6. □ "not only... but also..."句式 → 简化
7. □ "whether you need A or B, we can help" → 写具体
8. □ "etc./and more/and so on" → 写全或删除
9. □ 数字用"many/several/various"代替 → 写具体数字
10. □ 每一段是否回答一个具体问题 → 没有就删
```

## 形容词替换验证
检测到以下词时,验证是否已替换为具体数据:
- high quality/premium → 应有具体参数
- fast/quick → 应有具体数字
- professional/experienced → 应有具体证据
- comprehensive/wide → 应有具体数字
- cutting-edge/advanced → 应有具体设备/技术

## 输出
```json
{
  "aiSmellReport": {
    "pageUrl": "/services/cnc-aluminum-machining/",
    "totalChecks": 10,
    "passed": 8,
    "failed": 2,
    "failures": [
      { "check": 9, "location": "M03-Overview paragraph 2", "found": "various aluminum grades", "required": "具体数字如'50+ materials including 6061, 7075, 5052'" },
      { "check": 4, "location": "M01-Hero subtitle", "found": "28-word sentence", "required": "拆成两句(≤25词)" }
    ],
    "adjectiveReplacements": [{"found": "high quality", "replaced": false, "suggestion": "±0.005mm tolerance"}],
    "verdict": "FAIL",
    "action": "退回内容生产师修改,修正后重新提交"
  }
}
```

## 关键规则
1. 10项全部通过才算合格
2. 任一项不通过→退回内容生产师修改
3. 退回时给出具体修改方向(不是"写得不好"而是"第X段第X项不通过,需要改成XX")
4. 不因赶进度放行
