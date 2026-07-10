/**
 * IA v6 — /api/v2/people — 组织部
 * 数据源: people view (users + people_profile_extended)
 * 老路径: 无(全新模块,只是组织用户)
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { UserStore } from '../../db/user-store.js';
import { jsonResponse, parseJsonBody, ok, fail, paginated } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handlePeopleRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/people')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';

  // ====== R45-4: POST /api/v2/people — 真人创建(补全 R11 之后无 POST 端点的洞) ======
  // Body: { name, email, phone?, role?, department?, position?, password? }
  // 鉴权:admin 全权;operator 只能创建 member。
  // 行为:userStore.register(同 /api/auth/users POST) + 不分配 agent/pipeline(交给后续 PATCH)。
  if (method === 'POST' && u.pathname === '/api/v2/people') {
    if (!requireAnyScope(ctx, ['people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:admin'));
      return true;
    }
    // R45-4: people-routes 用 requireBearer(),ctx 是 OAuthContext(无 role) — 查 users 表拿
    const callerRes = ctx.userId
      ? await pool.query('SELECT role FROM users WHERE id = $1', [ctx.userId])
      : { rows: [] };
    const callerRole: string = callerRes.rows[0]?.role ?? '';
    if (callerRole !== 'admin' && callerRole !== 'operator') {
      jsonResponse(res, 403, fail('forbidden', '需要 admin 或 operator 角色'));
      return true;
    }
    const body = await parseJsonBody(req);
    const email = (body as any).email;
    const name = (body as any).name;
    const phone = (body as any).phone;
    const role = (body as any).role ?? 'member';
    const department = (body as any).department;
    const position = (body as any).position;
    const employeeStatus = (body as any).employeeStatus ?? 'active';
    // R45-4: password 必填 — 前端 wizard 邮件模式用 crypto.randomBytes 生成 12 字符密码
    const userPwd: string | undefined = (body as any).password;
    if (!email || !name) {
      jsonResponse(res, 400, fail('bad_request', 'email, name are required'));
      return true;
    }
    if (!userPwd || userPwd.length < 6) {
      jsonResponse(res, 400, fail('bad_request', 'password 必填且至少 6 字符'));
      return true;
    }
    const VALID_ROLES = ['admin', 'operator', 'member'];
    const VALID_EMPLOYEE_STATUS = ['active', 'paused', 'departed'];
    if (!VALID_ROLES.includes(role)) {
      jsonResponse(res, 400, fail('bad_request', `role must be one of ${VALID_ROLES.join(', ')}`));
      return true;
    }
    if (!VALID_EMPLOYEE_STATUS.includes(employeeStatus)) {
      jsonResponse(res, 400, fail('bad_request', `employeeStatus must be one of ${VALID_EMPLOYEE_STATUS.join(', ')}`));
      return true;
    }
    if (role === 'admin' && callerRole !== 'admin') {
      jsonResponse(res, 403, fail('forbidden', '只有 admin 能创建 admin 账户'));
      return true;
    }
    if (role === 'operator' && callerRole !== 'admin') {
      jsonResponse(res, 403, fail('forbidden', '只有 admin 能创建 operator 账户'));
      return true;
    }
    try {
      const userStore = new UserStore();
      const user = await userStore.register(email, userPwd, name, {
        phone, role, department, position, employeeStatus,
      });
      jsonResponse(res, 201, {
        user,
      });
    } catch (err: any) {
      jsonResponse(res, 400, fail('bad_request', String(err?.message ?? err)));
    }
    return true;
  }

  // GET /api/v2/people — 列表
  if (method === 'GET' && u.pathname === '/api/v2/people') {
    if (!requireAnyScope(ctx, ['people:read', 'people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:read 或 people:admin'));
      return true;
    }
    try {
      const limit = Math.min(parseInt(u.searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(u.searchParams.get('offset') || '0', 10);
      const dept = u.searchParams.get('department');
      const params: unknown[] = [tenantId];
      let where = 'tenant_id = $1';
      if (dept) { params.push(dept); where += ` AND department = $${params.length}`; }
      params.push(limit); params.push(offset);
      const result = await pool.query(
        `SELECT id, tenant_id, email, name, avatar_url, role, is_active,
                department, title, status, hired_at, rate_per_min, daily_tokens,
                team_ids, created_at, updated_at
           FROM people
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const countResult = await pool.query(
        `SELECT count(*) AS c FROM people WHERE ${where}`,
        params.slice(0, params.length - 2),
      );
      jsonResponse(res, 200, paginated(result.rows, parseInt(countResult.rows[0].c, 10), Math.floor(offset / limit) + 1, limit));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/people/:id — 详情
  const personMatch = u.pathname.match(/^\/api\/v2\/people\/([0-9a-f-]{36})$/);
  if (method === 'GET' && personMatch) {
    const id = personMatch[1];
    try {
      const result = await pool.query(`SELECT * FROM people WHERE id = $1`, [id]);
      if (result.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', `Person ${id} 不存在`));
        return true;
      }
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // PATCH /api/v2/people/:id — 更新 People 扩展档案
  if (method === 'PATCH' && personMatch) {
    if (!requireAnyScope(ctx, ['people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:admin'));
      return true;
    }
    const id = personMatch[1];
    try {
      const body = await parseJsonBody(req);
      const { department, title, hired_at, skills, status, rate_per_min, bio } = body;
      await pool.query(
        `INSERT INTO people_profile_extended
           (user_id, department, title, hired_at, skills, status, rate_per_min, bio, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, now())
         ON CONFLICT (user_id) DO UPDATE SET
           department = EXCLUDED.department,
           title = EXCLUDED.title,
           hired_at = EXCLUDED.hired_at,
           skills = EXCLUDED.skills,
           status = EXCLUDED.status,
           rate_per_min = EXCLUDED.rate_per_min,
           bio = EXCLUDED.bio,
           updated_at = now()`,
        [id, department, title, hired_at, JSON.stringify(skills || []), status, rate_per_min, bio],
      );
      jsonResponse(res, 200, ok({ updated: true, id }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/people/stats — 统计
  if (method === 'GET' && u.pathname === '/api/v2/people/stats') {
    if (!requireAnyScope(ctx, ['people:read', 'people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:read 或 people:admin'));
      return true;
    }
    try {
      const result = await pool.query(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE is_active)::int AS active,
           count(DISTINCT department)::int AS departments,
           COALESCE(sum(daily_tokens), 0)::bigint AS total_daily_tokens
         FROM people WHERE tenant_id = $1`,
        [tenantId],
      );
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // ====== R14-BC: /api/v2/people/:id/stats ======
  // 返回该真人今日完成/异常/状态 + 本周 token 消耗
  const statsMatch = u.pathname.match(/^\/api\/v2\/people\/([0-9a-f-]{36})\/stats$/);
  if (method === 'GET' && statsMatch) {
    if (!requireAnyScope(ctx, ['people:read', 'people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:read 或 people:admin'));
      return true;
    }
    const userId = statsMatch[1];
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTs = today.getTime(); // ms
      const weekAgoTs = todayTs - 7 * 24 * 60 * 60 * 1000;

      // 今日完成 pipeline_runs(success 且 started_at > today)
      const doneRes = await pool.query(
        `SELECT count(*)::int AS n
           FROM pipeline_runs pr
          WHERE pr.pipeline_id IN (
                  SELECT id FROM agent_pipelines WHERE owner_id = $1
                )
            AND pr.started_at >= to_timestamp($2 / 1000.0)
            AND pr.status = 'success'`,
        [userId, todayTs],
      );

      // 今日异常 activity_events(type='error')
      const errRes = await pool.query(
        `SELECT count(*)::int AS n
           FROM activity_events ae
          WHERE ae.user_id = $1
            AND ae.type = 'error'
            AND ae.timestamp > $2`,
        [userId, todayTs],
      );

      // 24h 活动数 → 状态判定
      const activityRes = await pool.query(
        `SELECT count(*)::int AS n
           FROM activity_events
          WHERE user_id = $1 AND timestamp > $2`,
        [userId, Date.now() - 24 * 60 * 60 * 1000],
      );

      // 本周 token 总量(input+output)
      const tokenRes = await pool.query(
        `SELECT COALESCE(sum(COALESCE(input_tokens,0) + COALESCE(output_tokens,0)),0)::bigint AS total
           FROM activity_events
          WHERE user_id = $1 AND timestamp > $2`,
        [userId, weekAgoTs],
      );

      // 本周 token 上限(估算,简单按 100k cap)
      const weekTokens = Number(tokenRes.rows[0]?.total ?? 0);
      const weekCap = 100_000;
      const weekPct = Math.min(100, Math.round((weekTokens / weekCap) * 100));

      const activityN = activityRes.rows[0]?.n ?? 0;
      const status: 'busy' | 'idle' | 'offline' =
        activityN >= 5 ? 'busy' : activityN > 0 ? 'idle' : 'offline';

      jsonResponse(res, 200, ok({
        todayDone: doneRes.rows[0]?.n ?? 0,
        todayErrors: errRes.rows[0]?.n ?? 0,
        status,
        activity24h: activityN,
        weekTokens,
        weekCap,
        weekPct,
      }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // ====== R14-BC: /api/v2/people/:id/usage?days=30 ======
  // 30 天 token 趋势 + 按 agent / 任务分解
  const usageMatch = u.pathname.match(/^\/api\/v2\/people\/([0-9a-f-]{36})\/usage$/);
  if (method === 'GET' && usageMatch) {
    if (!requireAnyScope(ctx, ['people:read', 'people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:read 或 people:admin'));
      return true;
    }
    const userId = usageMatch[1];
    const days = Math.min(Math.max(parseInt(u.searchParams.get('days') || '30', 10), 1), 90);
    try {
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

      // 按天聚合 token
      const dailyRes = await pool.query(
        `SELECT to_char(to_timestamp(timestamp / 1000.0) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS day,
                COALESCE(sum(COALESCE(input_tokens,0) + COALESCE(output_tokens,0)),0)::bigint AS tokens,
                count(*)::int AS calls
           FROM activity_events
          WHERE user_id = $1 AND timestamp > $2
          GROUP BY day
          ORDER BY day`,
        [userId, sinceMs],
      );

      // 按 agent(bot)分解
      const byAgentRes = await pool.query(
        `SELECT COALESCE(bot_name, '未知') AS agent,
                COALESCE(sum(COALESCE(input_tokens,0) + COALESCE(output_tokens,0)),0)::bigint AS tokens
           FROM activity_events
          WHERE user_id = $1 AND timestamp > $2
          GROUP BY agent
          ORDER BY tokens DESC
          LIMIT 10`,
        [userId, sinceMs],
      );

      // 按任务(pipeline)分解 — 通过 bot_id JOIN agent_pipelines
      const byTaskRes = await pool.query(
        `SELECT COALESCE(ap.name, '未绑定流水线') AS task,
                COALESCE(sum(COALESCE(ae.input_tokens,0) + COALESCE(ae.output_tokens,0)),0)::bigint AS tokens
           FROM activity_events ae
           LEFT JOIN agent_instances a ON a.id = ae.bot_id
           LEFT JOIN agent_pipelines ap ON ap.id::text = COALESCE(NULLIF(ae.response_preview, ''), NULL)
          WHERE ae.user_id = $1 AND ae.timestamp > $2
          GROUP BY task
          ORDER BY tokens DESC
          LIMIT 5`,
        [userId, sinceMs],
      );

      const totalTokens = dailyRes.rows.reduce((s: number, r: { tokens: string | number }) => s + Number(r.tokens), 0);
      const totalCalls = dailyRes.rows.reduce((s: number, r: { calls: string | number }) => s + Number(r.calls), 0);
      const dailyAvg = dailyRes.rows.length > 0
        ? Math.round(totalTokens / dailyRes.rows.length)
        : 0;

      jsonResponse(res, 200, ok({
        days,
        totalTokens,
        totalCalls,
        dailyAvg,
        daily: dailyRes.rows,
        byAgent: byAgentRes.rows,
        byTask: byTaskRes.rows,
      }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // ====== R14-BC: /api/v2/people/:id/agents ======
  // GET 列出该 user 关联的 agent;PATCH 绑定/解绑
  const agentsMatch = u.pathname.match(/^\/api\/v2\/people\/([0-9a-f-]{36})\/agents$/);
  if (agentsMatch) {
    const userId = agentsMatch[1];

    if (method === 'GET') {
      if (!requireAnyScope(ctx, ['people:read', 'people:admin', '*'])) {
        jsonResponse(res, 403, fail('forbidden', '需要 people:read 或 people:admin'));
        return true;
      }
      const result = await pool.query(
        `SELECT id, name, display_name, role_template, description, is_active,
                deployment_type, created_at, updated_at
           FROM agent_instances
          WHERE owner_user_id = $1
          ORDER BY created_at DESC`,
        [userId],
      );
      jsonResponse(res, 200, ok(result.rows));
      return true;
    }

    if (method === 'PATCH') {
      if (!requireAnyScope(ctx, ['people:admin', '*'])) {
        jsonResponse(res, 403, fail('forbidden', '需要 people:admin'));
        return true;
      }
      try {
        const body = await parseJsonBody(req);
        const agentIds: string[] = Array.isArray(body.agentIds)
          ? body.agentIds.filter((x: unknown) => typeof x === 'string')
          : [];
        const action: string = body.action === 'remove' ? 'remove' : body.action === 'set' ? 'set' : 'add';

        if (agentIds.length === 0 && action !== 'set') {
          jsonResponse(res, 400, fail('bad_request', 'agentIds 不能为空'));
          return true;
        }

        // R41-C: keep user_agent_bindings (m:n) in sync alongside the denormalized
        // owner_user_id cache. Without this, the new filter=unassigned (which reads
        // bindings) would still show agents that were 'bound' via the legacy PATCH.
        if (action === 'add') {
          await pool.query(
            'UPDATE agent_instances SET owner_user_id = $1 WHERE id = ANY($2::uuid[])',
            [userId, agentIds],
          );
          await pool.query(
            `INSERT INTO user_agent_bindings (tenant_id, user_id, agent_id, role)
               SELECT a.tenant_id, $1::uuid, a.id, 'owner'
                 FROM agent_instances a
                WHERE a.id = ANY($2::uuid[])
               ON CONFLICT (tenant_id, user_id, agent_id, role) DO UPDATE
                 SET updated_at = now()`,
            [userId, agentIds],
          );
        } else if (action === 'remove') {
          await pool.query(
            'UPDATE agent_instances SET owner_user_id = NULL WHERE owner_user_id = $1 AND id = ANY($2::uuid[])',
            [userId, agentIds],
          );
          await pool.query(
            `DELETE FROM user_agent_bindings
              WHERE user_id = $1 AND agent_id = ANY($2::uuid[])`,
            [userId, agentIds],
          );
        } else {
          // set: 先解绑所有,再绑定传入的
          await pool.query('UPDATE agent_instances SET owner_user_id = NULL WHERE owner_user_id = $1', [userId]);
          await pool.query('DELETE FROM user_agent_bindings WHERE user_id = $1', [userId]);
          if (agentIds.length > 0) {
            await pool.query(
              'UPDATE agent_instances SET owner_user_id = $1 WHERE id = ANY($2::uuid[])',
              [userId, agentIds],
            );
            await pool.query(
              `INSERT INTO user_agent_bindings (tenant_id, user_id, agent_id, role)
                 SELECT a.tenant_id, $1::uuid, a.id, 'owner'
                   FROM agent_instances a
                  WHERE a.id = ANY($2::uuid[])
                 ON CONFLICT (tenant_id, user_id, agent_id, role) DO UPDATE
                   SET updated_at = now()`,
              [userId, agentIds],
            );
          }
        }

        const result = await pool.query(
          `SELECT id FROM agent_instances WHERE owner_user_id = $1`,
          [userId],
        );
        jsonResponse(res, 200, ok({ bound: result.rows.map((r: { id: string }) => r.id) }));
        return true;
      } catch (e) {
        jsonResponse(res, 500, fail('internal_error', String(e)));
        return true;
      }
    }
  }

  return false;
}
