import { z } from 'zod';

// Skill DAG schema (for visual skill authoring)
export const DagNodeTypeSchema = z.enum(['llm', 'tool', 'kb_retrieval', 'http', 'branch', 'loop', 'parallel', 'output']);

export const DagNodeSchema = z.object({
  id: z.string().min(1),
  type: DagNodeTypeSchema,
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const DagEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  condition: z.string().optional(),
  label: z.string().optional(),
});

export const SkillDagSchema = z.object({
  nodes: z.array(DagNodeSchema),
  edges: z.array(DagEdgeSchema),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
});

export type DagNode = z.infer<typeof DagNodeSchema>;
export type DagEdge = z.infer<typeof DagEdgeSchema>;
export type SkillDag = z.infer<typeof SkillDagSchema>;

// Cycle detection: returns array of node IDs in cycle (empty if acyclic)
export function detectCycle(nodes: DagNode[], edges: DagEdge[]): string[] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);

  let cycle: string[] = [];

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    path.push(node);
    for (const next of adj.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        const idx = path.indexOf(next);
        cycle = path.slice(idx);
        cycle.push(next);
        return;
      }
      if (color.get(next) === WHITE) {
        dfs(next, path);
        if (cycle.length > 0) return;
      }
    }
    path.pop();
    color.set(node, BLACK);
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      dfs(n.id, []);
      if (cycle.length > 0) break;
    }
  }
  return cycle;
}

export function validateSkillDag(input: unknown): { ok: true; data: SkillDag } | { ok: false; errors: string[] } {
  const parsed = SkillDagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  }
  const cycle = detectCycle(parsed.data.nodes, parsed.data.edges);
  if (cycle.length > 0) {
    return { ok: false, errors: [`Cycle detected: ${cycle.join(' -> ')}`] };
  }
  // Edges must reference existing nodes
  const nodeIds = new Set(parsed.data.nodes.map(n => n.id));
  const dangling: string[] = [];
  for (const e of parsed.data.edges) {
    if (!nodeIds.has(e.from)) dangling.push(e.from);
    if (!nodeIds.has(e.to)) dangling.push(e.to);
  }
  if (dangling.length > 0) {
    return { ok: false, errors: [`Dangling edge references: ${[...new Set(dangling)].join(', ')}`] };
  }
  const outputNodes = parsed.data.nodes.filter(n => n.type === 'output');
  if (outputNodes.length === 0) {
    return { ok: false, errors: ['At least one output node is required'] };
  }
  return { ok: true, data: parsed.data };
}

// Re-export blueprint validator for convenience
export { validateAgentBlueprint, AgentBlueprintSchema } from './agent-blueprint.js';
