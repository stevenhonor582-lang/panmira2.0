-- R29-C: MCP 外部平台许可密钥绑定
-- 每条 MCP server 可绑定一个外部平台许可密钥(GitHub OAuth token / API key 等)
-- 在 MCP 模块统一管理(查看/修改/轮换),不再散落在「互联授权」
BEGIN;

ALTER TABLE mcp_servers
  ADD COLUMN IF NOT EXISTS external_platform_name varchar(100),
  ADD COLUMN IF NOT EXISTS external_platform_key_encrypted text,
  ADD COLUMN IF NOT EXISTS external_key_last_rotated timestamp with time zone;

COMMENT ON COLUMN mcp_servers.external_platform_name IS 'R29-C 外部平台名(GitHub/Slack/Notion),与 MCP server 自身认证(auth_type/api_key_encrypted)区分';
COMMENT ON COLUMN mcp_servers.external_platform_key_encrypted IS 'R29-C 外部平台许可密钥(encrypt() 加密),列表不回显明文';
COMMENT ON COLUMN mcp_servers.external_key_last_rotated IS 'R29-C 上次轮换时间,rotate-key 端点更新';

COMMIT;
