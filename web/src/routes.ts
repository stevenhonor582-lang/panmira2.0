import type { SidebarGroup } from './components/Sidebar';

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: '工作台',
    items: [
      { to: '/app', label: '总览' },
      { to: '/app/status', label: '实时状态' },
      { to: '/app/alerts', label: '预警中心' },
    ],
  },
  {
    label: '资源',
    items: [
      { to: '/app/models', label: '模型池' },
      { to: '/app/knowledge', label: '数智底座' },
      { to: '/app/resources', label: 'Skill / MCP 池' },
    ],
  },
  {
    label: '配置',
    items: [
      { to: '/app/agents', label: 'Agent 列表' },
      { to: '/app/channels', label: 'Channel 接入' },
      { to: '/app/permissions', label: '权限配置' },
    ],
  },
  {
    label: '管理',
    items: [
      { to: '/app/reports', label: '资源报表' },
      { to: '/app/cost', label: '成本分析' },
      { to: '/app/oauth-clients', label: 'OAuth Client' },
      { to: '/app/settings', label: '系统设置' },
      { to: '/app/audit', label: '审计日志' },
    ],
  },
];
