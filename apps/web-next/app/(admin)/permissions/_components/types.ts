export interface ScopeDef {
  name: string;
  description: string;
  category: string;
}

export interface RoleDef {
  name: string;
  label: string;
  scopes: Set<string>;
  description: string;
}

export const SCOPES: ScopeDef[] = [
  { name: "agent:read", description: "查看 agent 详情/列表", category: "Agent" },
  { name: "agent:run", description: "调用 agent", category: "Agent" },
  { name: "agent:edit", description: "编辑 agent 配置", category: "Agent" },
  { name: "agent:admin", description: "创建/删除 agent + 授权", category: "Agent" },
  { name: "channel:read", description: "查看 channel", category: "Channel" },
  { name: "channel:admin", description: "创建/删除 channel + 绑 agent", category: "Channel" },
  { name: "model:read", description: "查看模型池", category: "Model" },
  { name: "model:test", description: "测试调用模型", category: "Model" },
  { name: "model:admin", description: "创建/删除 provider + 配 fallback", category: "Model" },
  { name: "skill:read", description: "查看 skill 池", category: "Skill" },
  { name: "skill:invoke", description: "在 agent 中用 skill", category: "Skill" },
  { name: "skill:admin", description: "安装/卸载 skill", category: "Skill" },
  { name: "mcp:read", description: "查看 mcp server 池", category: "MCP" },
  { name: "mcp:invoke", description: "在 agent 中用 mcp", category: "MCP" },
  { name: "mcp:admin", description: "注册/删除 mcp server", category: "MCP" },
  { name: "knowledge:read", description: "检索 KB", category: "KB" },
  { name: "knowledge:write", description: "上传文档", category: "KB" },
  { name: "knowledge:admin", description: "创建/删除 KB + 改权限", category: "KB" },
  { name: "pipeline:read", description: "查看 pipeline", category: "Pipeline" },
  { name: "pipeline:trigger", description: "触发 pipeline", category: "Pipeline" },
  { name: "reports:read", description: "查看报表", category: "Reports" },
  { name: "reports:admin", description: "管理报表", category: "Reports" },
  { name: "oauth:admin", description: "创建/管理 OAuth client", category: "OAuth" },
  { name: "audit:read", description: "看审计日志", category: "Audit" },
];

export const ROLES: RoleDef[] = [
  {
    name: "Admin",
    label: "超管",
    description: "全部权限 (admin JWT 给通配 *)",
    scopes: new Set(SCOPES.map((s) => s.name)),
  },
  {
    name: "Team Owner",
    label: "Team 负责人",
    description: "管理本 team 内资源",
    scopes: new Set([
      "agent:read", "agent:run", "agent:edit", "agent:admin",
      "channel:read", "channel:admin",
      "model:read", "model:test",
      "knowledge:read", "knowledge:write",
      "mcp:read", "skill:read", "skill:invoke",
      "reports:read",
    ]),
  },
  {
    name: "Team Member",
    label: "Team 成员",
    description: "只读 + 调用",
    scopes: new Set([
      "agent:read", "agent:run",
      "channel:read",
      "model:read",
      "knowledge:read", "knowledge:write",
      "mcp:read", "skill:read", "skill:invoke",
    ]),
  },
  {
    name: "OAuth Client",
    label: "OAuth 客户端",
    description: "外部系统 / CLI",
    scopes: new Set([
      "agent:run",
      "knowledge:read",
      "reports:read",
    ]),
  },
];
