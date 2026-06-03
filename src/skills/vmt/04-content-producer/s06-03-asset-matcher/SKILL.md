---
name: vmt-asset-matcher
description: "P2内容生产: 素材匹配——为每个模块列出所需图片/视频/图表需求单"
user-invocable: false
context: fork
allowed_tools: Read, Write, Grep
---

# VMT 素材匹配与需求单

## 功能边界
为每个生成模块列出所需的图片/视频/图表/数据可视化需求。

## 素材类型优先级
1. 真实零件/车间照片 > 专业渲染图 > stock photo
2. 真实检测报告截图 > 证书图标
3. 对比图(并排) > 单张图片
4. 流程图/柱状图 > 纯文字描述

## 输出
```json
{
  "assetRequirements": [{
    "module": "M01-Hero",
    "assets": [{
      "type": "image",
      "description": "CNC五轴加工铝零件的车间实拍",
      "spec": "1200×800px, WebP, 主体为银色铝零件+机床背景",
      "priority": "P0",
      "alt": "Precision CNC aluminum machining at VMT factory"
    }]
  }, {
    "module": "M06-CaseStudy",
    "assets": [{
      "type": "image",
      "description": "医疗设备316L不锈钢外壳成品照片",
      "spec": "800×800px, WebP, 白色背景,多角度",
      "priority": "P0",
      "alt": "316L stainless steel medical device housing machined by VMT"
    }]
  }, {
    "module": "M05-MaterialSelector",
    "assets": [{
      "type": "comparison_chart",
      "description": "6061 vs 7075 vs 304 强度对比柱状图",
      "spec": "SVG或WebP, 含数据标签",
      "priority": "P1",
      "alt": "Material strength comparison chart: 6061 vs 7075 vs 304"
    }]
  }]
}
```

## 禁止使用的素材类型
- 握手/大厦/地球等stock photo风格的配图
- 纯装饰性图片(没有信息量)
- 低分辨率/模糊的证书截图
- 没有获得许可的客户Logo

## 关键规则
1. 每张图片有描述性alt文本(含关键词)
2. 每个模块至少1张图(纯文字模块除外)
3. 图片优先用VMT真实资产,没有的标注为"需要拍摄/制作"
