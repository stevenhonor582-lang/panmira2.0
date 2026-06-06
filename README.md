<div align="center">

# Panmira

### 多 Agent 协作平台 — 配置即用，开箱即运行

*AI Agent 管理 · 知识库 · 多端接入 · 一键部署*

<p>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Redis-7+-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License">
</p>

<p>
  <a href="https://feishu.cn"><img src="https://img.shields.io/badge/飞书-00D6B9?style=for-the-badge&logo=lark&logoColor=white" alt="Feishu"></a>
  <a href="https://telegram.org"><img src="https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
  <img src="https://img.shields.io/badge/Web_UI-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="Web UI">
</p>

</div>

## 一句话介绍

Panmira 让你在 Web 管理后台配置 AI 服务商和 Agent，自动创建工作空间、知识库、技能注册，5 分钟从安装到使用。

## 快速开始

### 一键安装（推荐）

```bash
git clone https://github.com/stevenhonor582-lang/panmira.git
cd panmira
./scripts/setup.sh
```

安装脚本会引导你完成：
1. 依赖检查（Node.js、PostgreSQL/Docker）
2. 交互式配置（AI API Key、Base URL、管理密码）
3. 前后端构建
4. 数据库初始化
5. 启动服务

### Docker 部署

```bash
git clone https://github.com/stevenhonor582-lang/panmira.git
cd panmira
cp .env.example .env   # 编辑 .env 填入你的配置
docker-compose up -d
```

### 手动安装

```bash
git clone https://github.com/stevenhonor582-lang/panmira.git
cd panmira
cp .env.example .env              # 编辑配置
npm install                       # 后端依赖
cd web && npm install && npm run build && cd ..
npm run build                     # 编译
psql $DATABASE_URL -f scripts/schema.sql  # 初始化数据库
npm start                         # 启动
```

前置条件：Node.js >= 18、PostgreSQL >= 14（需 pgvector 扩展）、Redis >= 7。

## 使用流程

```
安装 Panmira → 打开 http://localhost:9100 → 登录管理后台
→ 配置 AI 服务商（API Key + Base URL）
→ 创建 Bot（选择 Agent 模板）
→ 自动生成工作空间 + 知识库 + 技能注册
→ 开始使用
```

### 内置 Agent 模板

首次启动自动导入 4 个标准模板：

| 模板 | 用途 |
|------|------|
| **Full Stack Engineer** | 端到端开发、架构设计、TDD |
| **Content Creator** | 多平台内容策划与创作 |
| **Knowledge Curator** | 知识库管理、RAG 检索优化 |
| **Ops Engineer** | 系统部署、监控运维 |

## 架构

```
panmira/
├── config/
│   ├── workspace-skeleton.json    ← 工作区骨架（唯一真相源）
│   └── default-agents.json        ← Agent 模板（首次启动种子数据）
├── skills/                        ← 198 个内置技能（SKILL.md，2.9MB）
├── scripts/
│   ├── setup.sh                   ← 一键安装
│   └── schema.sql                 ← 完整数据库 Schema
├── src/                           ← 后端（Node.js + TypeScript）
├── web/                           ← 前端（React + Vite）
├── .env.example                   ← 配置模板
├── docker-compose.yml             ← PostgreSQL + Redis + Panmira
└── Dockerfile                     ← 多阶段构建
```

## 核心能力

| 组件 | 说明 |
|------|------|
| **Web 管理后台** | 配置 AI 服务商、创建 Bot、管理 Agent、浏览知识库 |
| **多端接入** | 飞书、Telegram、Web UI |
| **知识库** | 自动创建文件夹结构、文档管理、向量检索 |
| **技能系统** | 198 个内置技能，自动注册，支持用户自定义 |
| **Agent 总线** | Agent 之间互相委派任务 |
| **定时调度** | Cron 周期任务 + 一次性延迟任务 |
| **MetaMemory** | 共享知识库（可选，需单独部署） |

## 配置

### 环境变量

复制 `.env.example` 到 `.env`，所有字段都有注释说明。关键配置：

| 变量 | 必填 | 说明 |
|------|------|------|
| `ANTHROPIC_AUTH_TOKEN` | 是 | AI 服务商 API Key |
| `ANTHROPIC_BASE_URL` | 是 | AI 服务商 API 地址 |
| `API_SECRET` | 是 | 管理后台登录密码 |
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `ENCRYPTION_KEY` | 是 | 数据加密密钥（`openssl rand -hex 32`） |

### AI 服务商

支持所有 Anthropic 兼容 API：

```bash
# Anthropic 官方
ANTHROPIC_BASE_URL=https://api.anthropic.com

# 智谱 GLM
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic

# DeepSeek
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic

# Kimi / 月之暗面
ANTHROPIC_BASE_URL=https://api.moonshot.ai/anthropic
```

## 开发

```bash
npm run dev          # 开发模式（热重载）
npm run build        # 编译
npm start            # 生产模式
npm test             # 测试
```

## License

[MIT](LICENSE)
