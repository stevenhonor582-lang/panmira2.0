-- R68-3 · 块 8: 一个 MCP server 多密钥 + 轮询
CREATE TABLE IF NOT EXISTS mcp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  label varchar(100),
  encrypted_key text NOT NULL,
  failure_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_credentials_server_idx ON mcp_credentials(mcp_server_id);
CREATE INDEX IF NOT EXISTS mcp_credentials_pick_idx ON mcp_credentials(mcp_server_id, disabled, failure_count, last_used_at);
