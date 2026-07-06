import { z } from 'zod';

// Agent Template Execution Blueprint
// Reuses existing JSONB columns: orchestration / tools / boundary / ironLaws

export const KbRetrievalEntrySchema = z.object({
  kbId: z.string().uuid(),
  semanticName: z.string().min(1).max(64),
  strategy: z.enum(['vector-only', 'bm25', 'hybrid']),
  topK: z.number().int().min(1).max(100).default(5),
});

export const SkillRefSchema = z.object({
  skillId: z.string().min(1),
  skillVersion: z.string().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const McpRefSchema = z.object({
  serverId: z.string().uuid(),
  toolWhitelist: z.array(z.string()).default([]),
});

export const OrchestrationSchema = z.object({
  skillRefs: z.array(SkillRefSchema).default([]),
  mcpRefs: z.array(McpRefSchema).default([]),
  kbRetrievalMap: z.record(z.string(), KbRetrievalEntrySchema).default({}),
  maxTurns: z.number().int().min(1).max(100).default(10),
  maxBudgetUsd: z.number().min(0).max(1000).default(5),
  retryStrategy: z.object({
    maxAttempts: z.number().int().min(1).max(5).default(3),
    backoffMs: z.number().int().min(100).max(30000).default(1000),
  }).default({ maxAttempts: 3, backoffMs: 1000 }),
  timeoutPerStepMs: z.number().int().min(1000).max(600000).default(60000),
  parallelExecution: z.boolean().default(false),
});

export const ToolPolicySchema = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  perSessionLimits: z.record(z.string(), z.number().int().min(0)).default({}),
});

export const BoundarySchema = z.object({
  inputFilter: z.object({
    blockedKeywords: z.array(z.string()).default([]),
    maxLength: z.number().int().min(1).max(100000).default(10000),
  }).default({ blockedKeywords: [], maxLength: 10000 }),
  outputFilter: z.object({
    blockedKeywords: z.array(z.string()).default([]),
    piiRedaction: z.boolean().default(false),
  }).default({ blockedKeywords: [], piiRedaction: false }),
  escalationRules: z.array(z.object({
    condition: z.string(),
    action: z.enum(['notify', 'pause', 'abort']),
  })).default([]),
});

export const AgentBlueprintSchema = z.object({
  orchestration: OrchestrationSchema.optional(),
  tools: ToolPolicySchema.optional(),
  boundary: BoundarySchema.optional(),
  ironLaws: z.array(z.string()).default([]),
});

export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;
export type OrchestrationConfig = z.infer<typeof OrchestrationSchema>;
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;
export type BoundaryConfig = z.infer<typeof BoundarySchema>;
export type KbRetrievalEntry = z.infer<typeof KbRetrievalEntrySchema>;

export function validateAgentBlueprint(input: unknown): { ok: true; data: AgentBlueprint } | { ok: false; errors: string[] } {
  const parsed = AgentBlueprintSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  }
  return { ok: true, data: parsed.data };
}

export function emptyBlueprint(): AgentBlueprint {
  return {
    orchestration: {
      skillRefs: [],
      mcpRefs: [],
      kbRetrievalMap: {},
      maxTurns: 10,
      maxBudgetUsd: 5,
      retryStrategy: { maxAttempts: 3, backoffMs: 1000 },
      timeoutPerStepMs: 60000,
      parallelExecution: false,
    },
    tools: { allow: [], deny: [], perSessionLimits: {} },
    boundary: {
      inputFilter: { blockedKeywords: [], maxLength: 10000 },
      outputFilter: { blockedKeywords: [], piiRedaction: false },
      escalationRules: [],
    },
    ironLaws: [],
  };
}
