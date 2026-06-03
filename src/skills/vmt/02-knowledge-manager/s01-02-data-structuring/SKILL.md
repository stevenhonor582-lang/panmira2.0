---
name: vmt-data-structuring
description: "P1知识管理: 将原始文档转化为结构化数据，按各库Schema标准化"
user-invocable: false
context: fork
allowed-tools: Read, Write, Bash
---

# VMT 数据结构化

## 功能边界
将原始文档转化为可查询的结构化数据。知识底座的核心工程——结构化质量决定下游bot能力上限。

## 各库结构化Schema

### R0-品牌库
```yaml
companyName, founded, location, certifications[], employeeCount,
facilitySize, equipmentList[], valueProposition, brandStory
```

### R1-竞品库
```yaml
competitor, url, productLines[], priceRange, strengths[], weaknesses[],
trustSignals[], pageModules[], faqExtracted[], lastUpdated
```

### R2-市场/客户库
```yaml
industry, typicalParts[], commonMaterials[], keyRequirements[],
searchTrends, targetPersonas[], painPoints[]
```

### R3-SEO/关键词库
```yaml
keyword, searchVolume, intent, difficulty,
targetPageType, relatedKeywords[]
```

### R4-技术库 (最核心，材料+工艺+表面处理)
```yaml
material: { name, grades[], properties{tensile,hardness,density,...},
           suitableProcesses[], relativeCost, applications[] }
process: { name, tolerances{typical,max}, maxSize, minFeature,
          materialsSupported[], leadTime, equipmentUsed[] }
finish: { name, applicableMaterials[], thickness, hardness, colors[],
         appearance, comparisonNote, imageRef }
```

### R5-案例库
```yaml
title, industry, challenge(具体参数), solution(工艺/设备),
results[{metric,value,comparison}], images[], tags[], clientInfo(脱敏)
```

### R6-R10
参照各库定义的结构化字段。

## 数据质量规则
1. 数值必须带单位 (不用"精度高"而用"±0.005mm")
2. 定性转定量 (不用"交期快"而用"10-15工作日")
3. 模糊词替换为具体值 (不用"很多材料"而用"50+种材料")
4. 每条数据可溯源(有source字段指向原始文档)
5. 同类数据统一单位(全部用mm或inch,不混用)

## 去模糊化对照表
| 模糊词 | 替换为 |
|--------|--------|
| 高精度 | ±0.005mm (Typical) |
| 快速交付 | 10-15 business days |
| 多种材料 | 50+ materials (Al, SS, Ti, Cu, Plastics) |
| 大尺寸 | Max 800×600×500mm |
| 经验丰富 | 12 years, 5000+ projects |
