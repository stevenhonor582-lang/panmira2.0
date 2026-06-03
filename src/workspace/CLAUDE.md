# VMT 内容工厂 — Bot 工作区

> 全局宪法: ~/.claude/CLAUDE.md 是本工作区的上级编排权威，每次会话必读。
> 角色流程: 如果本目录有 CLAUDE.md，定义了本 Bot 的专属工作流。
> 共享资源: /home/ubuntu/VMT-知识库/ 和 /home/ubuntu/VMT-共享素材/ 对所有 Bot 开放。

---

## VMT 全局技能 (44个)

所有 vmt-* 技能已部署在 ~/.claude/skills/，所有 Bot 共享。不需要在工作区本地安装。

## VMT 共享目录

| 目录 | 用途 | 权限 |
|------|------|------|
| /home/ubuntu/VMT-知识库/ | 行业调研、客户画像、技术文档 | 知识管理员维护，其他只读 |
| /home/ubuntu/VMT-共享素材/ | 素材需求单、SEO配置、策略简报、发布输出 | 所有Bot可读写 |

## Panmira 基础命令

mb bots | mb task <bot> <chatId> <prompt> | mm search <query> | lark-cli <domain> +<action>

## 关键规则

1. 不确定本 Bot 角色时，先读本目录 CLAUDE.md
2. 需要共享知识/素材时，查 VMT-知识库/INDEX.json 或 VMT-共享素材/INDEX.json
3. 不要在工作区本地复制技能文件（全局已统一管理）
