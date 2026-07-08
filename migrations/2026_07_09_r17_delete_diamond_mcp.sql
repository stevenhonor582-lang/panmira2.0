-- R17-5 · 删除 Diamond Memory MCP(老残留)
-- 用户原话:"Diamond Memory 删除,这是老残留"
-- 期望结果:mcp_servers 表剩 6 个(GitHub / MiniMax / SSH×4)
BEGIN;

DELETE FROM mcp_servers
 WHERE name = 'Diamond Memory'
    OR name = 'diamond-memory';

COMMIT;

-- 验证:期望 6 行
SELECT name, transport
  FROM mcp_servers
 ORDER BY name;
