/**
 * R42-X e2e cleanup helper
 *
 * R42 split the old `agents` table into `agent_templates` (blueprints) +
 * `agent_instances` (deployed agents). R40-A's helper only knew about the
 * legacy `agents` table and silently left R42E2E-* rows in `agent_templates`
 * (7 leftovers as of 2026-07-10).
 *
 * This helper:
 *
 *   1. Tracks resources per type with trackTemplate(id) / trackInstance(id).
 *      Each id is deleted via the correct R42 route on afterAll:
 *        - template → DELETE /api/v2/admin/agent-templates/:id
 *        - instance → DELETE /api/v2/admin/agent-instances/:id
 *
 *   2. Exposes sweepTestResidue(request) — a best-effort safety net that
 *      lists + DELETEs every row whose name matches the test-prefix regex.
 *      Specs should call it from `test.beforeAll` so each run starts from
 *      zero (idempotent; no-op when no residue exists). Best-effort, never
 *      throws.
 *
 *   3. trackAgent is kept as a deprecated alias for trackInstance so old
 *      specs still compile; new specs should use trackInstance.
 *
 * Usage in a spec:
 *
 *   import {
 *     trackTemplate,
 *     trackInstance,
 *     cleanupTrackedResources,
 *     sweepTestResidue,
 *   } from "../helpers/cleanup";
 *
 *   // after a successful API call that created a template:
 *   trackTemplate(createdId, workingDir, "r42-create:foo");
 *
 *   // after creating an instance (formerly called "agent"):
 *   trackInstance(createdId, workingDir, "r42-instantiate:foo");
 *
 *   test.describe("…", () => {
 *     test.beforeAll(async ({ request }) => {
 *       await sweepTestResidue(request);  // safety net for any prior run
 *     });
 *     test.afterAll(async ({ request }) => {
 *       await cleanupTrackedResources(request);
 *     });
 *   });
 *
 * The helper is **best-effort**: a failure to delete one resource must not
 * prevent deletion of the others, so cleanup iterates in reverse and swallows
 * individual errors while logging them to stdout for the CI log.
 */
import type { APIRequestContext } from "@playwright/test";
import * as fs from "fs";

/**
 * Read the admin bearer token from /tmp/admin_token.txt. The token is
 * written by the local panmira dev stack and used by the e2e specs to
 * authenticate admin-scope requests.
 */
function readAdminToken(): string {
  try {
    if (fs.existsSync("/tmp/admin_token.txt")) {
      return fs
        .readFileSync("/tmp/admin_token.txt", "utf8")
        .replace("TOKEN=", "")
        .trim();
    }
  } catch {
    // ignore — file may be missing in CI without the dev stack
  }
  return "";
}


/** A single resource that was created during a test run and must be cleaned up. */
export interface TrackedResource {
  /** "template" or "instance" — the R42 split. */
  type: "template" | "instance";
  /** Database id (uuid) returned from the create / promote / copy API. */
  id: string;
  /** Optional working_dir returned by the API (virtual path; no fs cleanup needed). */
  workingDir?: string | null;
  /** Friendly label so the cleanup log is human-readable. */
  label?: string;
}

/** Module-scoped registry — same array across all tests in the worker. */
const createdIds: TrackedResource[] = [];

/** Reset for tests / between workers if running with multiple workers. */
export function resetTrackedRegistry(): void {
  createdIds.length = 0;
}

/** Push a freshly-created template into the cleanup registry. */
export function trackTemplate(id: string, workingDir?: string | null, label?: string): void {
  if (!id) return;
  createdIds.push({ type: "template", id, workingDir, label });
  // eslint-disable-next-line no-console
  console.log(`[e2e-cleanup] trackTemplate id=${id} label=${label ?? "(none)"}`);
}

/**
 * Push a freshly-created instance into the cleanup registry.
 * ("agent" in R40-A vocabulary maps to "instance" in R42 vocabulary.)
 */
export function trackInstance(id: string, workingDir?: string | null, label?: string): void {
  if (!id) return;
  createdIds.push({ type: "instance", id, workingDir, label });
  // eslint-disable-next-line no-console
  console.log(`[e2e-cleanup] trackInstance id=${id} label=${label ?? "(none)"}`);
}

/**
 * @deprecated Use trackInstance — "agent" is R40 vocabulary; R42 split
 * agents into agent_templates + agent_instances. This alias exists so older
 * specs keep compiling without immediate churn.
 */
export function trackAgent(id: string, workingDir?: string | null, label?: string): void {
  trackInstance(id, workingDir, label);
}

/** Read-only view for diagnostics. */
export function trackedCount(): number {
  return createdIds.length;
}

/** Read-only view of registry contents for diagnostics. */
export function trackedResources(): readonly TrackedResource[] {
  return createdIds;
}

/**
 * Resolve the R42 DELETE URL for a tracked resource.
 * Centralised so cleanupTrackedResources and the blacklist sweep share the
 * single source of truth (and so we never accidentally hit the legacy
 * `/api/v2/admin/agents/:id` endpoint, which only deletes the instance row
 * without scrubbing user_agent_bindings).
 */
function deleteUrlFor(x: TrackedResource | { type: "template" | "instance"; id: string }): string {
  if (x.type === "template") {
    return `/api/v2/admin/agent-templates/${x.id}`;
  }
  return `/api/v2/admin/agent-instances/${x.id}`;
}

/**
 * Iterate the registry in reverse (LIFO — newest first, so a copy that
 * depends on the original still resolves), and delete each entry via the
 * R42 admin API. Failures are logged but never re-thrown.
 */
export async function cleanupTrackedResources(request: APIRequestContext): Promise<void> {
  if (createdIds.length === 0) return;

  // eslint-disable-next-line no-console
  console.log(`[e2e-cleanup] afterAll: cleaning ${createdIds.length} tracked resources`);

  // Copy + reverse so we walk newest-first
  const items = [...createdIds].reverse();
  // Inject the admin bearer from /tmp/admin_token.txt. The Playwright request
  // fixture does not carry the admin token by default (it's a separate
  // browser-side cookie/localStorage path), and the DELETE endpoints require
  // an `agent:admin` scope.
  const token = readAdminToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  for (const x of items) {
    try {
      const url = deleteUrlFor(x);
      const res = await request.delete(url, headers ? { headers } : undefined);
      if (res.status() === 200) {
        // eslint-disable-next-line no-console
        console.log(`[e2e-cleanup] deleted ${x.type}=${x.id} label=${x.label ?? "(none)"} url=${url}`);
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
  return process.env.PANMIRA_API_BASE ?? "http://localhost:9100";
}

/**
 * Test-prefix blacklist regex. Matches names that look like test residue and
 * must never be allowed to accumulate across runs.
 *
 *   R\d+e2e    → e.g. R40E2E-, R42E2E-foo
 *   R\d+test   → R41TEST-foo
 *   R\d+refill → R40REFILL-foo
 *   R\d+debug  → R40DEBUG-foo
 *   e2e-       → e2e-foo
 *   test-      → test-foo
 *   fixture-   → fixture-foo
 */
export const TEST_PREFIX_REGEX =
  /^(R\d+e2e|R\d+test|R\d+refill|R\d+debug|e2e-|test-|fixture-)/i;

/**
 * Best-effort safety net: list + delete every row whose name matches the
 * test prefix blacklist. Uses the same auth/DELETE endpoints as the tracked
 * cleanup so it works without raw DB access from the e2e worker.
 */
export async function sweepTestResidue(request: APIRequestContext): Promise<void> {
  const base = apiBase();

  // Auth: the Playwright request fixture does not carry the admin token by
  // default, so we attach the bearer from /tmp/admin_token.txt explicitly.
  const token = readAdminToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  // Two sweeps — templates and instances — each lists, filters by name,
  // then deletes every match. Failures are logged and skipped.
  for (const [type, listPath, delPathBase] of [
    ["template", "/api/v2/admin/agent-templates", "/api/v2/admin/agent-templates"],
    ["instance", "/api/v2/admin/agent-instances", "/api/v2/admin/agent-instances"],
  ] as const) {
    let payload: { templates?: Array<{ id: string; name: string }>; instances?: Array<{ id: string; name: string }> };
    try {
      const res = await request.get(`${base}${listPath}`, headers ? { headers } : undefined);
      if (!res.ok()) {
        // eslint-disable-next-line no-console
        console.log(`[e2e-cleanup] sweep ${type}: list status=${res.status()}`);
        continue;
      }
      payload = await res.json();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[e2e-cleanup] sweep ${type}: list ERROR ${String(err)}`);
      continue;
    }

    const rows = (type === "template" ? payload.templates : payload.instances) ?? [];
    const targets = rows.filter((r) => TEST_PREFIX_REGEX.test(r.name ?? ""));
    if (targets.length === 0) continue;

    // eslint-disable-next-line no-console
    console.log(`[e2e-cleanup] sweep ${type}: deleting ${targets.length} residue row(s)`);
    for (const row of targets) {
      try {
        const url = deleteUrlFor({ type, id: row.id });
        const res = await request.delete(url, headers ? { headers } : undefined);
        // eslint-disable-next-line no-console
        console.log(
          `[e2e-cleanup] sweep ${type}: ${row.name} (${row.id}) → status=${res.status()}`,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`[e2e-cleanup] sweep ${type}: ERROR ${row.name} ${String(err)}`);
      }
    }
  }
}

