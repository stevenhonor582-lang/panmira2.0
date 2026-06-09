/**
 * Template Routes — CRUD for employee templates
 * GET    /api/templates         — list all
 * GET    /api/templates/:name   — get one
 * POST   /api/templates         — create
 * PUT    /api/templates/:name   — update
 * DELETE /api/templates/:name   — delete
 */

import type * as http from 'node:http';
import type { RouteContext } from './types.js';

function json(res: http.ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

export async function handleTemplateRoutes(
  ctx: RouteContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (!url.startsWith('/api/templates')) return false;

  const { pool } = await import('../../db/index.js');

  // GET /api/templates
  if (method === 'GET' && url === '/api/templates') {
    const result = await pool.query(
      'SELECT id, name, display_name, description, category, template_type, version, is_active, default_skills, default_agents, default_knowledge_folders, default_engine, default_model, boundary, iron_laws, orchestration, source_template_id, created_at FROM templates ORDER BY category, name'
    );
    json(res, 200, result.rows);
    return true;
  }

  // GET /api/templates/:name
  const getMatch = url.match(/^\/api\/templates\/([^/]+)$/);
  if (method === 'GET' && getMatch) {
    const result = await pool.query('SELECT * FROM templates WHERE name = $1', [getMatch[1]]);
    if (result.rows.length === 0) {
      json(res, 404, { error: 'Template not found' });
    } else {
      json(res, 200, result.rows[0]);
    }
    return true;
  }

  // POST /api/templates
  if (method === 'POST' && url === '/api/templates') {
    const body = JSON.parse(await readBody(req));
    const result = await pool.query(
      `INSERT INTO templates (name, display_name, description, category, template_type, system_prompt, default_skills, default_agents, default_knowledge_folders, default_engine, default_model, boundary, iron_laws, orchestration)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (name) DO UPDATE SET
         display_name=$2, description=$3, category=$4, template_type=$5, system_prompt=$6,
         default_skills=$7, default_agents=$8, default_knowledge_folders=$9,
         default_engine=$10, default_model=$11, boundary=$12, iron_laws=$13, orchestration=$14, updated_at=now()
       RETURNING *`,
      [body.name, body.display_name, body.description, body.category, body.template_type || 'role',
       body.system_prompt, JSON.stringify(body.default_skills || []), JSON.stringify(body.default_agents || []),
       JSON.stringify(body.default_knowledge_folders || []), body.default_engine || 'claude', body.default_model,
       JSON.stringify(body.boundary || {}), JSON.stringify(body.iron_laws || []), JSON.stringify(body.orchestration || {})]
    );
    json(res, 200, result.rows[0]);
    return true;
  }

  // PUT /api/templates/:name
  const putMatch = url.match(/^\/api\/templates\/([^/]+)$/);
  if (method === 'PUT' && putMatch) {
    const body = JSON.parse(await readBody(req));
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    for (const [key, value] of Object.entries(body)) {
      if (key === 'name') continue;
      paramCount++;
      if (['default_skills', 'default_agents', 'default_knowledge_folders', 'boundary', 'iron_laws', 'orchestration'].includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }
    fields.push('updated_at = now()');
    paramCount++;
    values.push(putMatch[1]);

    await pool.query(
      `UPDATE templates SET ${fields.join(', ')} WHERE name = $${paramCount}`,
      values
    );
    json(res, 200, { updated: true });
    return true;
  }

  // DELETE /api/templates/:name
  const delMatch = url.match(/^\/api\/templates\/([^/]+)$/);
  if (method === 'DELETE' && delMatch) {
    await pool.query('DELETE FROM templates WHERE name = $1', [delMatch[1]]);
    json(res, 200, { deleted: true });
    return true;
  }

  return false;
}
