/**
 * R40-A e2e cleanup helper
 *
 * R38-C6 / R38-C5 e2e specs create agents and templates via API but, prior to
 * R40-A, never cleaned them up, leaving 18+ rows in `agents` (name LIKE
 * '守静-R38C6-%' / '守静-DETAIL-%' / '从真人页复制-%').
 *
 * Usage in a spec:
 *
 *   import {
 *     trackAgent,
 *     trackTemplate,
 *     cleanupTrackedResources,
 *   } from "../helpers/cleanup";
 *
 *   // after a successful API call that created an agent/template:
 *   trackAgent(createdId, workingDir);
 *
 *   test.describe("…", () => {
 *     test.afterAll(async ({ request }) => {
 *       await cleanupTrackedResources(request);
 *     });
 *   });
 *
 * The helper is **best-effort**: a failure to delete one resource must not
 * prevent deletion of the others, so cleanup iterates in reverse and swallows
 * individual errors while logging them to stdout for the CI log.
 */
import * as fs from "fs";
import type { APIRequestContext } from "@playwright/test";

/** A single resource that was created during a test run and must be cleaned up. */
export interface TrackedResource {
  /** "agent" or "template" — only agent cleanup is wired today; kept for symmetry. */
  type: "agent" | "template";
  /** Database id (uuid) returned from the create / promote / copy API. */
  id: string;
  /** Optional working_dir returned by the API (virtual path; no fs cleanup needed). */
  workingDir?: string | null;
  /** Friendly label so the cleanup log is human-readable. */
  label?: string;
}

/** Module-scoped registry — same array across all tests in the worker. */
const createdIds: TrackedResource[] = [];

/**
 * Resolve the admin bearer token the same way the existing R38 specs do:
 * read /tmp/admin_token.txt (the file admin login writes). Returns "" if the
 * file is missing, in which case the cleanup loop will simply see 401s and
 * log them — never block test completion.
 */
function resolveAdminToken(): string {
  try {
    if (fs.existsSync("/tmp/admin_token.txt")) {
      return fs.readFileSync("/tmp/admin_token.txt", "utf8").replace(/^TOKEN=/, "").trim();
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Build the API base URL. Match the BASE/HOST settings used elsewhere in the
 * specs; allow override via env.
 */
function resolveApiBase(): string {
  return process.env.PANMIRA_API_BASE ?? "http://localhost:9100";
}

/** Reset for tests / between workers if running with multiple workers. */
export function resetTrackedRegistry(): void {
  createdIds.length = 0;
}

/** Push a freshly-created agent into the cleanup registry. */
export function trackAgent(id: string, workingDir?: string | null, label?: string): void {
  if (!id) return;
  createdIds.push({ type: "agent", id, workingDir, label });
  // eslint-disable-next-line no-console
  console.log(`[e2e-cleanup] trackAgent id=${id} label=${label ?? "(none)"}`);
}

/** Push a freshly-created template into the cleanup registry. */
export function trackTemplate(id: string, workingDir?: string | null, label?: string): void {
  if (!id) return;
  createdIds.push({ type: "template", id, workingDir, label });
  // eslint-disable-next-line no-console
  console.log(`[e2e-cleanup] trackTemplate id=${id} label=${label ?? "(none)"}`);
}

/** Read-only view for diagnostics. */
export function trackedCount(): number {
  return createdIds.length;
}

/**
 * Iterate the registry in reverse (LIFO — newest first, so a copy that
 * depends on the original still resolves), and delete each entry via the
 * admin API. Failures are logged but never re-thrown.
 */
export async function cleanupTrackedResources(request: APIRequestContext): Promise<void> {
  if (createdIds.length === 0) return;

  const token = resolveAdminToken();
  if (!token) {
    // eslint-disable-next-line no-console
    console.log("[e2e-cleanup] WARN: no admin token in /tmp/admin_token.txt — skipping cleanup");
    return;
  }
  const baseUrl = resolveApiBase();
  const headers = { authorization: `Bearer ${token}` };

  // eslint-disable-next-line no-console
  console.log(`[e2e-cleanup] afterAll: cleaning ${createdIds.length} tracked resources`);

  // Copy + reverse so we walk newest-first
  const items = [...createdIds].reverse();
  for (const x of items) {
    try {
      // Backend endpoint: DELETE /api/v2/admin/agents/:id
      // (handleAgentsCrudRoutes — requires agent:admin scope, satisfied by
      // the admin bearer token in /tmp/admin_token.txt.)
      const res = await request.delete(`${baseUrl}/api/v2/admin/agents/${x.id}`, { headers });
      if (res.status() === 200) {
        // eslint-disable-next-line no-console
        console.log(`[e2e-cleanup] deleted ${x.type}=${x.id} label=${x.label ?? "(none)"}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `[e2e-cleanup] skip ${x.type}=${x.id} status=${res.status()} body=${(await res.text()).slice(0, 200)}`,
        );
      }
      // working_dir is a virtual path (`/workspace/agents/<slug>-<rand>`)
      // — there is no on-disk artifact to clean. Logged for visibility only.
      if (x.workingDir) {
        // eslint-disable-next-line no-console
        console.log(`[e2e-cleanup] virtual workingDir=${x.workingDir} (no fs cleanup needed)`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[e2e-cleanup] ERROR deleting ${x.type}=${x.id}: ${String(err)}`);
    }
  }
  resetTrackedRegistry();
}

/**
 * Resolve the api base url from env or fall back to localhost:9100.
 * Matches the BASE used elsewhere in the specs.
 */
export function apiBase(): string {
  return resolveApiBase();
}
