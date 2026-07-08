-- R16-2: 导入 7 个真实 MCP(从 ~/.claude.json 读)
-- 2026-07-08
BEGIN;

-- 清空占位 MCP(Filesystem/GitHub/Slack/Notion)
DELETE FROM mcp_servers WHERE name IN ('Filesystem MCP','GitHub MCP','Slack MCP','Notion MCP');

-- 导入 7 个真实 MCP
INSERT INTO mcp_servers (id, tenant_id, name, url, transport, auth_type, api_key_encrypted, status, health_status, tools_cache, created_at, updated_at)
SELECT gen_random_uuid(), t.id, v.name, v.url, v.transport, v.auth_type, NULL, 'active', 'ok', '[]'::jsonb, now(), now()
FROM (VALUES
  ('Diamond Memory'::text, 'stdio:///home/ubuntu/.claude/mcp-servers/diamond-memory-mcp.py', 'stdio'::text, 'none'::text),
  ('SSH Turtle',         'ssh://43.153.24.96',  'http', 'api_key'),
  ('SSH Ruoshui',        'ssh://43.164.0.122',  'http', 'api_key'),
  ('SSH VMT',            'ssh://43.162.93.177', 'http', 'api_key'),
  ('SSH Hailianzhida',   'ssh://43.172.69.44',  'http', 'api_key'),
  ('GitHub MCP',         'npx:///@modelcontextprotocol/server-github', 'http', 'api_key'),
  ('MiniMax 多模态',     'stdio:///home/ubuntu/minimax_mcp.py', 'stdio', 'none')
) AS v(name, url, transport, auth_type)
CROSS JOIN (SELECT id FROM tenants LIMIT 1) t
ON CONFLICT DO NOTHING;

COMMIT;
