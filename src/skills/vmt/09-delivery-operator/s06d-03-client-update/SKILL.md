---
name: vmt-client-update
description: "P6交付: 客户进度更新——在关键节点自动生成客户更新通知"
user_invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 客户进度更新

## 功能边界
在关键节点自动生成客户更新通知。

## 推送时机
```
订单确认时:   "订单已确认+工单号+预计交期"
首件完成后:   "首件照片+检测数据(如约定)"
生产中:       "进度照片(如约定,大订单适用)"
质检完成后:   "质检通过+检测报告"
发货时:       "物流单号+预计到达+装箱照片+文件清单"
```

## 更新模板
```
Hi [Name],

[节点更新,一句话说清进展]

[关键数据/照片(如有)]

Next step: [下一步+预计时间]

—
VMT Order: [WO Number]
```

## 输出
```json
{
  "clientUpdate": {
    "stage": "First Article Approved",
    "message": "Hi [Name], the first article of your bracket has been machined and passed CMM inspection. All critical dimensions are within spec (±0.008mm actual vs ±0.01mm required). See attached photo and inspection data. Next step: Full production run — estimated completion June 20. — VMT Order: VMT-WO-2026-0526-001",
    "photoAvailable": true,
    "photoDescription": "首件在CMM检测台上的照片",
    "progressPercent": 30,
    "nextMilestone": "Full production completion",
    "estimatedShipDate": "2026-06-23"
  }
}
```

## 关键规则
1. 有照片优先附照片(真实感)
2. 有延迟提前说,不给"惊喜"
3. 更新频率: 小订单≤每周一次,大订单每节点一次
4. 不用自动发送,人工确认后发送
