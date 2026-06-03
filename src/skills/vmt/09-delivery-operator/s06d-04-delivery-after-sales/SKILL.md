---
name: vmt-delivery-after-sales
description: "P6交付: 交付与售后——发货安排+出口文件+收货确认+售后跟进"
user_invocable: false
context: fork
allowed_tools: Read, Write, Bash
---

# VMT 交付与售后

## 功能边界
发货安排+出口文件准备+客户收货确认+售后跟进。

## 发货必备文件
```
□ 商业发票(Commercial Invoice)
□ 装箱单(Packing List)
□ 质检报告(Inspection Report)
□ 材质证书(Material Certificate)
□ 原产地证明(如需要)
□ 其他客户定制文件
```

## 发货通知
```
Hi [Name],

Your order [WO Number] has been shipped.

📦 Tracking: [Carrier] #[Tracking Number]
📅 Estimated Arrival: [Date]
📎 Documents: Invoice, Packing List, Inspection Report, Material Cert

Packing photo attached. Please confirm receipt upon arrival.

—
VMT
```

## 售后跟进节奏
```
发货后7天:   确认收到+质量满意+是否有问题
发货后30天:  是否有新项目需求(轻触达,不推销)
发货后90天:  休眠激活(新内容/新能力推送)
```

## 问题处理
客户反馈质量问题 → 升级客户服务师(S04-04)→附带完整上下文
客户有新需求 → 分类询盘(S04-01)→标准流程处理

## 关键规则
1. 文件齐全(缺一不可)
2. 物流单号发货当天通知
3. 7天跟进不推销,确认质量满意
4. 30天跟进轻触达
5. 收货后更新R5-案例库(脱敏)
