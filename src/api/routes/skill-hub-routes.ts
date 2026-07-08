import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type * as http from 'node:http';
import { jsonResponse, parseJsonBody } from './helpers.js';
import type { RouteContext } from './types.js';
import { SKILL_REGISTRY, refreshSkillRegistry } from '../../skills/skill-registry.js';
import { installSkillFromHub, installFromGithub, syncSkillToBotStaging, isAdminBot, installSkillWithBinding } from '../skills-installer.js';
import { recordSkillUsage } from '../../services/usage-tracker.js';

export async function handleSkillHubRoutes(
  ctx: RouteContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const { logger, registry, peerManager } = ctx;
  const store = ctx.skillHubStore;

  if (!url.startsWith('/api/skills')) return false;

  // GET /api/skills/search?q=...
  if (method === 'GET' && url.startsWith('/api/skills/search')) {
    if (!store) {
      jsonResponse(res, 503, { error: 'Skill Hub not available' });
      return true;
    }
    const params = new URL(url, 'http://localhost').searchParams;
    const query = params.get('q') || '';
    const localResults = await store.search(query);
    // Include peer skills if not a peer request
    const isPeer = req.headers['x-panmira-origin'] === 'peer';
    if (!isPeer && peerManager) {
      const peerSkills = peerManager.getPeerSkills?.() ?? [];
      const filtered = query
        ? peerSkills.filter((s) => {
            const q = query.toLowerCase();
            return (
              s.name.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q) ||
              s.tags.some((t) => t.toLowerCase().includes(q))
            );
          })
        : peerSkills;
      jsonResponse(res, 200, { skills: [...localResults, ...filtered.map((s) => ({ ...s, snippet: '' }))] });
    } else {
      jsonResponse(res, 200, { skills: localResults });
    }
    return true;
  }

  // GET /api/skills/registry — list all skills with scope/bindings
  // Query params: ?bot=botName — include enabled state for that bot
  if (method === 'GET' && url.startsWith('/api/skills/registry')) {
    const urlObj = new URL(url, 'http://localhost');
    const botName = urlObj.searchParams.get('bot') || '';

    // Load bot bindings from DB if bot specified
    let botBindings: Map<string, boolean> = new Map();
    if (botName) {
      try {
        const { pool: dbPool } = await import('../../db/index.js');
        const { rows } = await dbPool.query(
          'SELECT skill_name, enabled FROM bot_skill_bindings WHERE bot_name = $1',
          [botName],
        );
        for (const r of rows) botBindings.set(r.skill_name, r.enabled);
      } catch { /* table might not exist yet */ }
    }

    const skills = SKILL_REGISTRY.map((s) => {
      // Extract plugin name from prefix (e.g. "gstack:review" → "gstack", "lark-im" → "lark")
      let pluginName = '';
      if (s.name.includes(':')) {
        pluginName = s.name.split(':')[0];
      } else if (s.name.startsWith('lark')) {
        pluginName = 'lark';
      } else if (['panmira','metaskill','skill-hub','metamemory','phone-call'].includes(s.name)) {
        pluginName = 'system';
      } else if (s.name.startsWith('vmt-')) {
        pluginName = 'vmt';
      } else if (['article-writing','content-engine','brand-voice','blueprint','deep-research','market-research','investor-materials','seo','a-share-analyst'].includes(s.name)) {
        pluginName = 'ecc';
      } else if (['beautiful-prose','humanize-chinese','plan-writing','business-analyst','pitch-psychologist'].includes(s.name)) {
        pluginName = 'antigravity';
      } else if (['copywriting','copy-editing','content-strategy','emails','marketing-psychology'].includes(s.name)) {
        pluginName = 'marketing';
      } else if (['gpt-image2-ppt','slides-grab'].includes(s.name)) {
        pluginName = 'slides';
      } else {
        pluginName = 'user';
      }

      return {
        name: s.name,
        summary: s.summary,
        category: s.category,
        platform: s.platform,
        alwaysLoad: s.alwaysLoad || false,
        scope: (s as any).scope || 'global',
        ownerBot: (s as any).ownerBot || '',
        triggers: s.triggers || [],
        pluginName,
        directory: (s as any).directory || path.join(os.homedir(), '.claude', 'skills', s.name),
        // Per-bot binding state (only when ?bot= specified)
        ...(botName ? { enabled: botBindings.has(s.name) ? botBindings.get(s.name) : undefined } : {}),
      };
    });
    jsonResponse(res, 200, { skills });
    return true;
  }

  // POST /api/skills/:name/publish-from-bot — publish from a bot's working directory
  if (method === 'POST' && /^\/api\/skills\/[^/]+\/publish-from-bot$/.test(url)) {
    if (!store) {
      jsonResponse(res, 503, { error: 'Skill Hub not available' });
      return true;
    }
    const skillName = decodeURIComponent(url.split('/')[3]);
    const body = await parseJsonBody(req);
    const botName = body.botName as string;
    if (!botName) {
      jsonResponse(res, 400, { error: 'Missing botName' });
      return true;
    }
    const bot = registry.get(botName);
    if (!bot) {
      jsonResponse(res, 404, { error: `Bot not found: ${botName}` });
      return true;
    }

    const skillDir = path.join(bot.config.claude.defaultWorkingDirectory, '.claude', 'skills', skillName);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      jsonResponse(res, 404, { error: `Skill not found at ${skillMdPath}` });
      return true;
    }

    const skillMd = fs.readFileSync(skillMdPath, 'utf-8');

    // Pack references/ directory if it exists
    let referencesTar: Buffer | undefined;
    const refsDir = path.join(skillDir, 'references');
    if (fs.existsSync(refsDir)) {
      try {
        const { execSync } = await import('node:child_process');
        referencesTar = execSync(`tar cf - -C "${skillDir}" references`, { maxBuffer: 50 * 1024 * 1024 });
      } catch (err: any) {
        logger.warn({ err: err.message, skillName }, 'Failed to pack references directory');
      }
    }

    const record = await store.publish({ name: skillName, skillMd, referencesTar, author: botName });
    jsonResponse(res, 201, { name: record.name, version: record.version, published: true });
    return true;
  }

  // POST /api/skills/:name/install — install a skill to a bot
  if (method === 'POST' && /^\/api\/skills\/[^/]+\/install$/.test(url)) {
    if (!store) {
      jsonResponse(res, 503, { error: 'Skill Hub not available' });
      return true;
    }
    const skillName = decodeURIComponent(url.split('/')[3]);
    const body = await parseJsonBody(req);
    const botName = body.botName as string;
    if (!botName) {
      jsonResponse(res, 400, { error: 'Missing botName' });
      return true;
    }
    const bot = registry.get(botName);
    if (!bot) {
      jsonResponse(res, 404, { error: `Bot not found: ${botName}` });
      return true;
    }

    const source = (body.source as string) || 'local';

    let skillMd: string;
    let referencesTar: Buffer | undefined;

    if (source.startsWith('peer:')) {
      // Fetch from peer
      const peerName = source.slice(5);
      if (!peerManager?.fetchPeerSkill) {
        jsonResponse(res, 400, { error: 'Peer manager not available' });
        return true;
      }
      const peerSkill = await peerManager.fetchPeerSkill(peerName, skillName);
      if (!peerSkill) {
        jsonResponse(res, 404, { error: `Skill "${skillName}" not found on peer "${peerName}"` });
        return true;
      }
      skillMd = peerSkill.skillMd;
      referencesTar = peerSkill.referencesTar;
    } else {
      // Fetch from local store
      const content = await store.getContent(skillName);
      if (!content) {
        jsonResponse(res, 404, { error: `Skill not found: ${skillName}` });
        return true;
      }
      skillMd = content.skillMd;
      referencesTar = content.referencesTar;
    }

    const workDir = bot.config.claude.defaultWorkingDirectory;
    installSkillFromHub(workDir, skillName, skillMd, referencesTar, logger);
    await installSkillWithBinding(skillName, botName, 'global', logger);
    // Plan D: 记录 skill 使用
    recordSkillUsage('default', skillName, 1);
    jsonResponse(res, 200, { installed: true, botName, skillName });
    return true;
  }

  // GET /api/skills/:name — get skill details
  if (method === 'GET' && /^\/api\/skills\/[^/]+$/.test(url)) {
    if (!store) {
      jsonResponse(res, 503, { error: 'Skill Hub not available' });
      return true;
    }
    const skillName = decodeURIComponent(url.split('/')[3]);
    const record = await store.get(skillName);
    // R13E: attach usage stats from skill_usage table regardless of source
    let usageStats = { totalCalls: 0, totalSuccess: 0, avgLatencyMs: 0, lastUsedAt: null as string | null, daily: [] as any[] };
    try {
      const { pool } = await import('../../db/index.js');
      const { rows } = await pool.query(
        `SELECT
           COALESCE(sum(call_count), 0)::int AS total_calls,
           COALESCE(sum(success_count), 0)::int AS total_success,
           COALESCE(round(avg(avg_latency_ms)), 0)::int AS avg_latency,
           max(created_at) AS last_used_at
         FROM skill_usage WHERE skill_id = $1`,
        [skillName],
      );
      const { rows: daily } = await pool.query(
        `SELECT date, sum(call_count)::int AS calls, sum(success_count)::int AS ok
         FROM skill_usage WHERE skill_id = $1
         GROUP BY date ORDER BY date DESC LIMIT 30`,
        [skillName],
      );
      usageStats = {
        totalCalls: Number(rows[0]?.total_calls ?? 0),
        totalSuccess: Number(rows[0]?.total_success ?? 0),
        avgLatencyMs: Number(rows[0]?.avg_latency ?? 0),
        lastUsedAt: rows[0]?.last_used_at ? new Date(rows[0].last_used_at).toISOString() : null,
        daily: daily.map((r: any) => ({ date: r.date, calls: Number(r.calls), ok: Number(r.ok) })),
      };
    } catch { /* table missing — leave defaults */ }
    if (record) {
      jsonResponse(res, 200, { ...record, usage: usageStats });
      return true;
    }
    // Try peers
    if (peerManager?.fetchPeerSkill) {
      // Search through peer skills to find which peer has it
      const peerSkills = peerManager.getPeerSkills?.() ?? [];
      const match = peerSkills.find((s) => s.name === skillName);
      if (match) {
        const full = await peerManager.fetchPeerSkill(match.peerName, skillName);
        if (full) {
          jsonResponse(res, 200, { ...full, peerName: match.peerName, peerUrl: match.peerUrl, usage: usageStats });
          return true;
        }
      }
    }
    // R13E: fallback — derive from bot_skill_bindings + agents.skills
    try {
      const { pool } = await import('../../db/index.js');
      const { rows } = await pool.query(
        `SELECT skill_name, bool_or(enabled) AS enabled, count(*)::int AS bot_count,
           array_agg(DISTINCT bot_name) AS bots, max(installed_at) AS installed_at
         FROM bot_skill_bindings WHERE skill_name = $1
         GROUP BY skill_name`,
        [skillName],
      );
      if (rows.length > 0) {
        jsonResponse(res, 200, {
          name: skillName,
          description: `Bound to ${rows[0].bot_count} bot(s): ${(rows[0].bots || []).slice(0, 10).join(', ')}`,
          source: 'custom',
          enabled: !!rows[0].enabled,
          tags: ['bot_binding'],
          installedAt: rows[0].installed_at ? new Date(rows[0].installed_at).toISOString() : null,
          bots: rows[0].bots || [],
          usage: usageStats,
        });
        return true;
      }
    } catch { /* table missing */ }
    jsonResponse(res, 404, { error: `Skill not found: ${skillName}` });
    return true;
  }

  // GET /api/skills — list all skills
  if (method === 'GET' && (url === '/api/skills' || url.startsWith('/api/skills?'))) {
    // R10 (2026-07-08): Skill Hub store 不一定可用 — 回退到 DB 派生:
    //   1. bot_skill_bindings (skill_name)  → 'custom' source
    //   2. agents.skills jsonb array        → 'built-in' source
    // 这样无论 store 是否存在,/api/skills 永远返回真实绑定数据。
    let storeSkills: any[] = [];
    if (store) {
      try { storeSkills = await store.list(); } catch { storeSkills = []; }
    }
    const isPeer = req.headers['x-panmira-origin'] === 'peer';
    let peerSkills: any[] = [];
    if (!isPeer && peerManager?.getPeerSkills) {
      try { peerSkills = peerManager.getPeerSkills() || []; } catch { peerSkills = []; }
    }

    // Derived skills from DB
    let dbSkills: any[] = [];
    try {
      const { pool } = await import('../../db/index.js');
      // 1. From bot_skill_bindings — group by skill_name
      const { rows: bindingRows } = await pool.query(`
        SELECT
          COALESCE(NULLIF(skill_id, ''), skill_name) AS id,
          skill_name,
          bool_or(COALESCE(enabled, true)) AS enabled,
          max(installed_at) AS installed_at,
          count(*)::int AS bot_count,
          array_agg(DISTINCT bot_name) FILTER (WHERE bot_name IS NOT NULL) AS bots
        FROM bot_skill_bindings
        GROUP BY COALESCE(NULLIF(skill_id, ''), skill_name), skill_name
        ORDER BY skill_name
      `);
      const byName = new Map<string, any>();
      for (const r of bindingRows) {
        byName.set(r.skill_name, {
          id: String(r.id ?? r.skill_name),
          name: r.skill_name,
          description: `Bound to ${r.bot_count} bot(s)${r.bots ? ': ' + r.bots.slice(0, 5).join(', ') : ''}`,
          source: 'custom' as const,
          enabled: !!r.enabled,
          tags: ['bot_binding'],
          installedAt: r.installed_at ? new Date(r.installed_at).toISOString() : undefined,
        });
      }

      // 2. From agents.skills jsonb — array of skill name strings
      const { rows: agentRows } = await pool.query(`
        SELECT skill::text AS skill, count(DISTINCT a.id)::int AS bot_count,
          bool_and(a.status = 'active') AS all_active,
          array_agg(DISTINCT a.name) AS bots
        FROM agents a, jsonb_array_elements_text(a.skills) AS skill
        WHERE a.skills IS NOT NULL AND a.skills != '[]'::jsonb
        GROUP BY skill
        ORDER BY skill
      `);
      for (const r of agentRows) {
        if (byName.has(r.skill)) continue;  // bot_skill_bindings takes priority
        byName.set(r.skill, {
          id: r.skill,
          name: r.skill,
          description: `Agent skill (${r.bot_count} agent${r.bot_count === 1 ? '' : 's'}: ${(r.bots || []).slice(0, 5).join(', ')})`,
          source: 'built-in' as const,
          enabled: r.all_active !== false,
          tags: ['agent_jsonb'],
          installedAt: undefined,
        });
      }
      dbSkills = Array.from(byName.values());
    } catch (err) {
      logger?.warn?.({ err: err instanceof Error ? err.message : 'unknown' }, 'skills DB derivation failed');
    }

    jsonResponse(res, 200, {
      skills: [...storeSkills, ...peerSkills, ...dbSkills],
    });
    return true;
  }

  // PUT /api/bot-skills/:botName/:skillName — enable/disable a skill for a bot
  if (method === 'PUT' && /^\/api\/bot-skills\/[^/]+\/[^/]+$/.test(url)) {
    const parts = url.split('/');
    const botName = decodeURIComponent(parts[3]);
    const skillName = decodeURIComponent(parts[4]);
    const body = await parseJsonBody(req);
    const enabled = body.enabled !== false; // default true

    try {
      const { pool } = await import('../../db/index.js');
      await pool.query(
        `UPDATE bot_skill_bindings SET enabled = $1, installed_at = now()
         WHERE bot_name = $2 AND skill_name = $3`,
        [enabled, botName, skillName],
      );
      jsonResponse(res, 200, { botName, skillName, enabled });
    } catch (err: any) {
      jsonResponse(res, 500, { error: err?.message || 'Failed to update skill binding' });
    }
    return true;
  }

  // POST /api/skills — publish a skill (admin-only for global scope)
  if (method === 'POST' && url === '/api/skills') {
    if (!store) {
      jsonResponse(res, 503, { error: 'Skill Hub not available' });
      return true;
    }
    const body = await parseJsonBody(req);
    const skillMd = body.skillMd as string;
    if (!skillMd) {
      jsonResponse(res, 400, { error: 'Missing skillMd' });
      return true;
    }
    const scope = (body.scope as string) || 'global';
    const botName = body.botName as string;

    // Admin check for global skills
    if (scope === 'global') {
      if (!botName || !(await isAdminBot(botName))) {
        jsonResponse(res, 403, { error: 'Only admin bots can create global skills. Set scope: "bot" for private skills.' });
        return true;
      }
    }

    const referencesTar = body.referencesTar ? Buffer.from(body.referencesTar as string, 'base64') : undefined;

    const record = await store.publish({
      name: (body.name as string) || '',
      skillMd,
      referencesTar,
      author: body.author as string,
    });
    jsonResponse(res, 201, { name: record.name, version: record.version, published: true });
    return true;
  }

  // DELETE /api/skills/:name
  if (method === 'DELETE' && /^\/api\/skills\/[^/]+$/.test(url)) {
    if (!store) {
      jsonResponse(res, 503, { error: 'Skill Hub not available' });
      return true;
    }
    const skillName = decodeURIComponent(url.split('/')[3]);
    const body = await parseJsonBody(req);
    const botName = body.botName as string;
    if (!botName || !(await isAdminBot(botName))) {
      jsonResponse(res, 403, { error: 'Only admin bots can delete skills' });
      return true;
    }
    const removed = await store.remove(skillName);
    if (removed) {
      jsonResponse(res, 200, { name: skillName, removed: true });
    } else {
      jsonResponse(res, 404, { error: `Skill not found: ${skillName}` });
    }
    return true;
  }

  // POST /api/skills/install-from-github — install a skill from a GitHub URL
  if (method === 'POST' && url === '/api/skills/install-from-github') {
    const body = await parseJsonBody(req);
    const githubUrl = body.githubUrl as string;
    if (!githubUrl) {
      jsonResponse(res, 400, { error: 'Missing githubUrl' });
      return true;
    }
    try {
      const result = installFromGithub(githubUrl, body.skillName as string | undefined, logger);

      // Sync to all existing bots' staging dirs so they can use the new skill
      if (!result.alreadyInstalled) {
        const botWorkDirs = registry.list().map((b) => b.workingDirectory);
        syncSkillToBotStaging(result.name, botWorkDirs, logger);
        refreshSkillRegistry();
      }

      jsonResponse(res, 200, {
        installed: true,
        name: result.name,
        path: result.path,
        alreadyInstalled: result.alreadyInstalled,
      });
    } catch (err: any) {
      logger.warn({ err: err.message, githubUrl }, 'Failed to install skill from GitHub');
      jsonResponse(res, 400, { error: err.message });
    }
    return true;
  }

  // R13E: POST /api/skills/install — unified install (URL/source aware)
  // body: { source: 'github' | 'url' | 'hub', url: string, skillName?: string, botName?: string }
  if (method === 'POST' && url === '/api/skills/install') {
    const body = await parseJsonBody(req);
    const src = (body.source as string) || 'url';
    const skillUrl = (body.url as string) || (body.githubUrl as string) || '';
    const skillName = body.skillName as string | undefined;
    const botName = body.botName as string | undefined;
    if (!skillUrl) {
      jsonResponse(res, 400, { error: 'Missing url' });
      return true;
    }
    try {
      if (src === 'github' || skillUrl.includes('github.com')) {
        const result = installFromGithub(skillUrl, skillName, logger);
        if (!result.alreadyInstalled) {
          const botWorkDirs = registry.list().map((b) => b.workingDirectory);
          syncSkillToBotStaging(result.name, botWorkDirs, logger);
          refreshSkillRegistry();
        }
        // Optional: bind to a specific bot
        if (botName) {
          try { await installSkillWithBinding(result.name, botName, 'global', logger); } catch { /* binding optional */ }
        }
        jsonResponse(res, 200, { installed: true, name: result.name, path: result.path, alreadyInstalled: result.alreadyInstalled });
      } else {
        // Generic URL — treat as raw skill_md URL, fetch and store
        const resp = await fetch(skillUrl, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) {
          jsonResponse(res, 400, { error: `fetch_failed: HTTP ${resp.status}` });
          return true;
        }
        const skillMd = await resp.text();
        const name = skillName || skillUrl.split('/').pop()?.replace(/\.md$/i, '') || 'custom-skill';
        if (store) {
          const record = await store.publish({ name, skillMd, author: botName || 'installer' });
          if (botName) {
            try { await installSkillWithBinding(name, botName, 'global', logger); } catch { /* optional */ }
          }
          jsonResponse(res, 200, { installed: true, name: record.name, version: record.version });
        } else {
          jsonResponse(res, 503, { error: 'Skill Hub not available for URL install' });
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message, skillUrl }, 'Failed skill install');
      jsonResponse(res, 400, { error: err.message });
    }
    return true;
  }

  // R13E: POST /api/skills/:name/enable — bind to a bot (body: { botName, enabled? })
  if (method === 'POST' && /^\/api\/skills\/[^/]+\/enable$/.test(url)) {
    const skillName = decodeURIComponent(url.split('/')[3]);
    const body = await parseJsonBody(req);
    const botName = body.botName as string;
    const enabled = body.enabled !== false;
    if (!botName) {
      jsonResponse(res, 400, { error: 'Missing botName' });
      return true;
    }
    try {
      const { pool } = await import('../../db/index.js');
      // Upsert binding
      await pool.query(
        `INSERT INTO bot_skill_bindings (bot_name, skill_name, enabled, installed_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (bot_name, skill_name) DO UPDATE SET enabled = $3, installed_at = now()`,
        [botName, skillName, enabled],
      );
      jsonResponse(res, 200, { botName, skillName, enabled });
    } catch (err: any) {
      jsonResponse(res, 500, { error: err?.message || 'Failed to enable skill' });
    }
    return true;
  }

  // R13E: DELETE /api/skills/:name/binding — unbind skill from a bot (body: { botName })
  if (method === 'DELETE' && /^\/api\/skills\/[^/]+\/binding$/.test(url)) {
    const skillName = decodeURIComponent(url.split('/')[3]);
    const body = await parseJsonBody(req);
    const botName = body.botName as string;
    if (!botName) {
      jsonResponse(res, 400, { error: 'Missing botName' });
      return true;
    }
    try {
      const { pool } = await import('../../db/index.js');
      const result = await pool.query(
        'DELETE FROM bot_skill_bindings WHERE bot_name = $1 AND skill_name = $2',
        [botName, skillName],
      );
      jsonResponse(res, 200, { unbound: (result.rowCount ?? 0) > 0, botName, skillName });
    } catch (err: any) {
      jsonResponse(res, 500, { error: err?.message || 'Failed to unbind skill' });
    }
    return true;
  }

  // R13E: POST /api/skills/batch — batch enable/disable (body: { skillNames: string[], botName, enabled })
  if (method === 'POST' && url === '/api/skills/batch') {
    const body = await parseJsonBody(req);
    const skillNames = Array.isArray(body.skillNames) ? body.skillNames : [];
    const botName = body.botName as string;
    const enabled = body.enabled !== false;
    if (!botName || skillNames.length === 0) {
      jsonResponse(res, 400, { error: 'botName and skillNames[] required' });
      return true;
    }
    try {
      const { pool } = await import('../../db/index.js');
      // Build a batch upsert
      let updated = 0;
      for (const skillName of skillNames) {
        await pool.query(
          `INSERT INTO bot_skill_bindings (bot_name, skill_name, enabled, installed_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (bot_name, skill_name) DO UPDATE SET enabled = $3, installed_at = now()`,
          [botName, String(skillName), enabled],
        );
        updated++;
      }
      jsonResponse(res, 200, { updated, botName, enabled });
    } catch (err: any) {
      jsonResponse(res, 500, { error: err?.message || 'Batch update failed' });
    }
    return true;
  }

  // POST /api/skills/refresh — re-scan ~/.claude/skills/ and update registry
  if (method === 'POST' && url === '/api/skills/refresh') {
    const updated = refreshSkillRegistry();
    jsonResponse(res, 200, { total: updated.length });
    return true;
  }

  return false;
}
