import { useTranslation } from 'react-i18next';
import s from './PermissionsView.module.css';

interface ScopeRow { name: string; description: string; }

const SCOPES: ScopeRow[] = [
  { name: 'agent:read', description: '查看 agent 详情/列表' },
  { name: 'agent:run', description: '调用 agent' },
  { name: 'agent:edit', description: '编辑 agent 配置' },
  { name: 'agent:admin', description: '创建/删除 agent + 授权' },
  { name: 'team:read', description: '查看 team' },
  { name: 'team:admin', description: '创建/删除 team + 管成员' },
  { name: 'channel:read', description: '查看 channel' },
  { name: 'channel:admin', description: '创建/删除 channel + 绑 agent' },
  { name: 'model:read', description: '查看模型池' },
  { name: 'model:test', description: '测试调用模型' },
  { name: 'model:admin', description: '创建/删除 provider + 配 fallback' },
  { name: 'skill:read', description: '查看 skill 池' },
  { name: 'skill:invoke', description: '在 agent 中用 skill' },
  { name: 'skill:admin', description: '安装/卸载 skill' },
  { name: 'mcp:read', description: '查看 mcp server 池' },
  { name: 'mcp:invoke', description: '在 agent 中用 mcp' },
  { name: 'mcp:admin', description: '注册/删除 mcp server' },
  { name: 'knowledge:read', description: '检索 KB' },
  { name: 'knowledge:write', description: '上传文档' },
  { name: 'knowledge:admin', description: '创建/删除 KB + 改权限' },
  { name: 'pipeline:read', description: '查看 pipeline' },
  { name: 'pipeline:trigger', description: '触发 pipeline' },
  { name: 'oauth:admin', description: '创建/管理 OAuth client' },
  { name: 'audit:read', description: '看审计日志' },
];

const ROLES = [
  { name: 'Admin', label: '超管', scopes: new Set(SCOPES.map(s => s.name)) },
  { name: 'Team Owner', label: 'Team 负责人', scopes: new Set(['agent:read', 'agent:run', 'agent:edit', 'agent:admin', 'channel:read', 'channel:admin', 'team:read', 'team:admin', 'model:read', 'knowledge:read', 'knowledge:write']) },
  { name: 'Team Member', label: 'Team 成员', scopes: new Set(['agent:read', 'agent:run', 'channel:read', 'model:read', 'knowledge:read', 'knowledge:write']) },
  { name: 'OAuth Client', label: 'OAuth 客户端', scopes: new Set(['agent:run', 'knowledge:read']) },
];

export function PermissionsView() {
  const { t } = useTranslation();
  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('permissions.title')}</h1>
        <p className={s.subtitle}>{t('permissions.subtitle')}</p>
      </header>
      <div className={s.matrixWrap}>
        <table className={s.matrix}>
          <thead>
            <tr>
              <th className={s.scopeCol}>{t('permissions.scopeCol')}</th>
              {ROLES.map((r) => (
                <th key={r.name} className={s.roleCol}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCOPES.map((sc) => (
              <tr key={sc.name}>
                <td className={s.scopeCell}>
                  <div className={s.scopeName}>{sc.name}</div>
                  <div className={s.scopeDesc}>{sc.description}</div>
                </td>
                {ROLES.map((r) => (
                  <td key={r.name} className={s.checkCell} data-testid={`scope-${sc.name}-${r.name}`}>
                    {r.scopes.has(sc.name) ? <span className={s.check}>✓</span> : <span className={s.dash}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
