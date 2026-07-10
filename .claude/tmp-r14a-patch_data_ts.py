"""Patch apps/web-next/app/(app)/overview/_components/data.ts to add R14-A types."""
import sys
from pathlib import Path

target = Path(sys.argv[1])
src = target.read_text(encoding='utf-8')

NEW_TYPES = '''
// ── R14-A: bottom 3 columns ─────────────────────────────────────
export interface DashboardTodoItem {
  id: string;
  name: string;
  status: string;
  runCount: number;
  successCount: number;
  triggerType: string;
  updatedAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  kind: "pending" | "scheduled";
}

export type DashboardAlertSeverity = "error" | "warn";
export type DashboardAlertType =
  | "pipeline_failed"
  | "user_errors"
  | "ai_provider"
  | "docs_stale";

export interface DashboardAlertItem {
  key: string;
  severity: DashboardAlertSeverity;
  type: DashboardAlertType;
  label: string;
  detail: string;
  href?: string;
}

export interface DashboardCompletedItem {
  id: string;
  pipelineId: string | null;
  name: string;
  status: "completed";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  ownerId: string | null;
  ownerName: string | null;
  triggeredBy: string | null;
}
'''

# 1) inject new types just before "export async function fetchDashboardAggregate"
marker = '// --- fetchers -----------------------------------------------------------'
if NEW_TYPES.strip().split('\n')[2] not in src:
    if marker in src:
        src = src.replace(marker, NEW_TYPES + '\n' + marker, 1)
    else:
        print('MARKER_NOT_FOUND', file=sys.stderr); sys.exit(2)

# 2) extend DashboardAggregate interface with todo/alerts/completed + meta
needle = "  recentSessions: Array<{\n    id: string;\n    botName: string | null;\n    title: string | null;\n    platform: string | null;\n    updatedAt: string | null;\n    messageCount: number;\n  }>;\n  meta?: { generatedAt?: string; ragTotal?: number; ragHits?: number };\n}"
addition = '''  recentSessions: Array<{
    id: string;
    botName: string | null;
    title: string | null;
    platform: string | null;
    updatedAt: string | null;
    messageCount: number;
  }>;
  // R14-A: bottom 3 columns
  todo: DashboardTodoItem[];
  alerts: DashboardAlertItem[];
  completed: DashboardCompletedItem[];
  meta?: {
    generatedAt?: string;
    ragTotal?: number;
    ragHits?: number;
    servicesUp?: number;
    servicesTotal?: number;
    aiReachable?: number;
    aiTotal?: number;
    diskPct?: number;
    memPct?: number;
    cpuPct?: number;
    pipelineTotal24h?: number;
    pipelineCompleted24h?: number;
    pipelineFailed24h?: number;
    pipelineSuccessRate?: number;
    employeesActive24h?: number;
    employeesTotalActive?: number;
  };
}'''
if 'todo: DashboardTodoItem[]' not in src:
    if needle in src:
        src = src.replace(needle, addition, 1)
    else:
        print('INTERFACE_NEEDLE_NOT_FOUND', file=sys.stderr); sys.exit(3)

target.write_text(src, encoding='utf-8')
print('OK patched, new size:', len(src))
