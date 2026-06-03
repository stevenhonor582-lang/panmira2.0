---
name: vmt-progress-tracking
description: "P6交付: 进度跟踪——定义7个关键节点,监控完成情况和时间偏差"
user_invocable: false
context: fork
allowed_tools: Read, Write, Bash
---

# VMT 进度跟踪与节点监控

## 7个关键节点
```
节点1  编程完成:   CAM编程+仿真完成
节点2  首件确认:   首件加工+CMM检测,偏差在公差内→放行
节点3  批量加工:   全部加工完成,SPC数据正常
节点4  质检完成:   终检报告出具
节点5  表面处理:   [如适用] 处理完成+外观检查
节点6  包装完成:   包装+标签+装箱单
节点7  发货:       快递取件+单号
```

## 状态灯
```
🟢 绿灯: 实际进度 = 计划进度
🟡 黄灯: 偏差<1天 → 内部关注,暂不通知客户
🔴 红灯: 偏差>1天 → 提前通知客户+新交期+原因+补偿方案
```

## 输出
```json
{
  "progressReport": {
    "woNumber": "VMT-WO-2026-0526-001",
    "currentStage": "节点3-批量加工",
    "progressPercent": 55,
    "completedStages": ["节点1-编程完成", "节点2-首件确认"],
    "nextMilestone": "节点4-质检完成(预计2026-06-20)",
    "estimatedCompletion": "2026-06-23",
    "delayRisk": "green",
    "actualVsPlan": {
      "plannedCompletion": "2026-06-23",
      "currentForecast": "2026-06-23",
      "variance": "0 days"
    }
  }
}
```

## 关键规则
1. 黄灯→内部排查原因,准备预案
2. 红灯→提前告知客户(不到了交期才说)
3. 红灯通知包含: 新交期+原因+补偿方案
4. 每个节点完成时记录实际时间(用于后续交期预估优化)
