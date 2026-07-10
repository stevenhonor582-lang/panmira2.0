import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer } from '../oauth-middleware.js';
import { callLlm, LlmCallError } from '../../services/llm-client.js';

/**
 * R20: POST /api/v2/admin/pipelines/ai-generate
 * body: { description: string }
 * response: { success, nodes, edges, explanation, model, usage }
 *
 * Turns a natural-language task description into a DAG (React Flow
 * nodes/edges) by prompting the default LLM. The caller then loads the
 * result onto the canvas and fine-tunes it.
 *
 * node.data follows DagNodeMeta (types.ts) — the bot reference id is `refId`
 * (NOT agentTemplateId), so the ShapeConfigPanel agent picker resolves it.
 */
export async function handlePipelineAiGenerate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (!url.startsWith('/api/v2/admin/pipelines/ai-generate')) return false;
  if (method !== 'POST') {
    jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const body = await parseJsonBody(req);
  const description = String(body.description || '').trim();
  if (!description || description.length < 5) {
    jsonResponse(res, 400, { error: '描述太短,请详细说明任务目标' });
    return true;
  }
  if (description.length > 2000) {
    jsonResponse(res, 400, { error: '描述超过 2000 字' });
    return true;
  }

  try {
    // 1. Pull active digital-employee instances for this tenant, excluding
    //    the R15B / 失败测试 / L6 Test junk that pollutes the catalogue.
    const agentsResult = await pool.query(
      `SELECT id, name, display_name, role_template, description
         FROM agent_instances
        WHERE tenant_id = $1
          AND status = 'active'
          AND is_template = false
          AND name NOT ILIKE '%R15B%'
          AND name NOT ILIKE '%失败测试%'
          AND name NOT ILIKE '%L6 Test%'
        ORDER BY name
        LIMIT 20`,
      [ctx.tenantId],
    );
    const agents = agentsResult.rows as Array<{
      id: string;
      name: string;
      display_name?: string | null;
      role_template?: string | null;
      description?: string | null;
    }>;
    if (agents.length === 0) {
      jsonResponse(res, 400, { error: '没有可用数字员工,请先创建' });
      return true;
    }

    // 2. Build the prompt with the concrete agent menu.
    const agentList = agents
      .map((a) => {
        const label = a.display_name || a.name;
        return `- ${label} (id:${a.id}, 角色:${a.role_template || '通用'}):${String(a.description || '').slice(0, 60)}`;
      })
      .join('\n');

    const system = `你是任务编排专家。把用户描述转成 DAG(有向无环图)任务编排。

可用数字员工:
${agentList}

节点类型(node.data.kind):
- bot:数字员工执行(必填 refId,从上面可用数字员工里选)
- human:真人审批(需要人决策时用)
- skill:调用技能
- tool:调用工具
- conditional:条件分支(必须有 2 个出边 true/false)
- parallel:并行网关

输出严格 JSON(只输出 JSON,不要 markdown 代码块,不要解释文字):
{
  "nodes": [
    {"id":"n1","kind":"bot","label":"步骤名","refId":"<上面某个 agent id>","reason":"为什么这步"},
    {"id":"n2","kind":"conditional","label":"判断","reason":"..."},
    {"id":"n3","kind":"human","label":"人工审批","reason":"..."}
  ],
  "edges": [
    {"source":"n1","target":"n2"},
    {"source":"n2","target":"n3","label":"true"},
    {"source":"n2","target":"n4","label":"false"}
  ],
  "explanation":"整体编排逻辑说明(1-2 句话)"
}

规则:
- node.id 用 n1,n2,n3...(按执行顺序)
- bot 节点必须有 refId(从上面可用数字员工选,必须是真实 id)
- conditional 节点必须有 2 个出边,edge.label 标 true/false
- 一步步拆解用户描述,每个关键步骤一个节点
- 需要人决策时用 human 节点
- 节点数控制在 3-12 个(太复杂用户难改)
- reason 简短说明每步目的`;

    // 3. Call the default LLM (DeepSeek V4 / GLM via callLlm).
    const llmResult = await callLlm({
      system,
      messages: [{ role: 'user', content: description }],
      maxTokens: 8192,
      timeoutMs: 90000,
    });

    // 4. Parse JSON — LLM may wrap it in markdown fences or add prose.
    const rawText = (llmResult.text || '').trim();
    const jsonStr = extractJson(rawText);
    if (!jsonStr) {
      jsonResponse(res, 502, {
        error: 'AI 输出解析失败',
        raw: rawText.slice(0, 500),
      });
      return true;
    }

    let parsed: { nodes?: unknown[]; edges?: unknown[]; explanation?: string };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      jsonResponse(res, 502, { error: 'AI 输出 JSON 无效', raw: jsonStr.slice(0, 500) });
      return true;
    }

    // 5. Validate + convert to React Flow format (auto layout).
    const { nodes, edges } = toReactFlowFormat(parsed, agents);
    const explanation = String(parsed.explanation || '').slice(0, 500);

    jsonResponse(res, 200, {
      success: true,
      nodes,
      edges,
      explanation,
      model: llmResult.model,
      usage: llmResult.usage,
    });
    return true;
  } catch (err: unknown) {
    if (err instanceof LlmCallError) {
      jsonResponse(res, err.statusCode, {
        error: 'ai_generate_failed',
        message: err.message,
        provider: err.provider,
      });
      return true;
    }
    const e = err as Error;
    jsonResponse(res, 500, { error: 'ai_generate_failed', message: e.message });
    return true;
  }
}

/** Extract a JSON object from LLM output (handles ```json fences + leading/trailing prose). */
function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

/** Validate the LLM payload and emit React Flow nodes/edges with a layered layout. */
function toReactFlowFormat(
  parsed: { nodes?: unknown[]; edges?: unknown[] },
  agents: Array<{ id: string }>,
): { nodes: unknown[]; edges: unknown[] } {
  const agentIds = new Set(agents.map((a) => a.id));
  const validKinds = new Set(['bot', 'human', 'skill', 'tool', 'conditional', 'parallel']);

  const rawNodes = Array.isArray(parsed.nodes) ? (parsed.nodes as Array<Record<string, unknown>>) : [];
  const rawEdges = Array.isArray(parsed.edges) ? (parsed.edges as Array<Record<string, unknown>>) : [];

  if (rawNodes.length > 30) rawNodes.length = 30; // hard cap; UI soft cap is 12

  const levels = computeLevels(rawNodes, rawEdges);
  const byLevel = new Map<number, number[]>();
  rawNodes.forEach((n, i) => {
    const id = String(n.id ?? `n${i + 1}`);
    const lv = levels.get(id) ?? 0;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(i);
  });

  const nodes = rawNodes.map((n, i) => {
    const id = String(n.id ?? `n${i + 1}`);
    const lv = levels.get(id) ?? 0;
    const siblings = byLevel.get(lv) || [];
    const idxInLevel = siblings.indexOf(i);
    const kindRaw = String(n.kind ?? 'bot');
    const kind = validKinds.has(kindRaw) ? kindRaw : 'bot';
    const refIdRaw = n.refId != null ? String(n.refId) : '';
    const refId = kind === 'bot' ? (agentIds.has(refIdRaw) ? refIdRaw : agents[0]?.id) : undefined;
    return {
      id,
      type: 'dagNode',
      position: {
        x: 100 + idxInLevel * 220,
        y: 80 + lv * 130,
      },
      data: {
        kind,
        label: String(n.label ?? id).slice(0, 40),
        refId,
        reason: String(n.reason ?? '').slice(0, 100),
      },
    };
  });

  const nodeIds = new Set(nodes.map((n) => (n as { id: string }).id));
  const edges = rawEdges
    .filter((e) => {
      const s = String(e.source ?? '');
      const t = String(e.target ?? '');
      return nodeIds.has(s) && nodeIds.has(t);
    })
    .map((e, i) => ({
      id: `e-${e.source}-${e.target}-${i}`,
      source: String(e.source),
      target: String(e.target),
      label: e.label != null ? String(e.label) : undefined,
      animated: true,
    }));

  return { nodes, edges };
}

/** BFS-style longest-path layering for a left-to-right-ish auto layout. */
function computeLevels(
  nodes: Array<Record<string, unknown>>,
  edges: Array<Record<string, unknown>>,
): Map<string, number> {
  const levels = new Map<string, number>();
  nodes.forEach((n, i) => levels.set(String(n.id ?? `n${i + 1}`), 0));
  // Relax edges until stable (cap iterations to avoid runaway loops).
  let changed = true;
  let iter = 0;
  while (changed && iter < 20) {
    changed = false;
    iter++;
    for (const e of edges) {
      const s = String(e.source ?? '');
      const t = String(e.target ?? '');
      if (!levels.has(s) || !levels.has(t)) continue;
      const srcLv = levels.get(s)!;
      if (srcLv + 1 > (levels.get(t) as number)) {
        levels.set(t, srcLv + 1);
        changed = true;
      }
    }
  }
  return levels;
}
