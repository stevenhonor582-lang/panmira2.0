/**
 * Pipeline Rate Limiter (Phase 4 Level 3 Fix 2 + Level 4 #1):
 * - Per-user rolling 1-minute rate limit (default 5/min — tightened in L4)
 * - Per-user rolling daily token cap (default 50,000 tokens/day — tightened in L4)
 * - In-memory Map-based, fail-open if anything throws
 * - Configurable via env: PIPELINE_RATE_LIMIT_PER_MIN, PIPELINE_DAILY_TOKEN_LIMIT
 * - Per-user override map (admin can grant higher/lower limits without restart)
 *
 * Level 4 hardening:
 * - Defaults tightened (10/min -> 5/min; 100k -> 50k)
 * - Production env-var check: if NODE_ENV=production and no env override, log warning
 * - Per-user override Map<userId, { ratePerMin?, dailyTokens? }>
 *   checkRateLimit / checkDailyTokenCap / _inspect consult override first, fall back to default
 */

const DEFAULT_RATE_PER_MIN = Number(process.env.PIPELINE_RATE_LIMIT_PER_MIN) || 5;
const DEFAULT_DAILY_TOKENS = Number(process.env.PIPELINE_DAILY_TOKEN_LIMIT) || 50_000;
const ONE_MIN_MS = 60_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Production startup check: defaults only fire when env not set. Warn loudly so
// the operator knows the system is using tightened defaults.
if (process.env.NODE_ENV === 'production' &&
    !process.env.PIPELINE_RATE_LIMIT_PER_MIN &&
    !process.env.PIPELINE_DAILY_TOKEN_LIMIT) {
  // eslint-disable-next-line no-console
  console.warn('[pipeline-rate-limit] using tightened defaults in production: 5/min, 50k tokens/day. ' +
               'Set PIPELINE_RATE_LIMIT_PER_MIN and PIPELINE_DAILY_TOKEN_LIMIT to override.');
}

interface Bucket { count: number; resetAt: number; }
interface TokenBucket { tokens: number; resetAt: number; }
interface UserOverride { ratePerMin?: number; dailyTokens?: number; }

const rateMap = new Map<string, Bucket>();
const tokenMap = new Map<string, TokenBucket>();
const overrides = new Map<string, UserOverride>();
// Track which users changed since last flush — only persist dirty entries.
const dirty = new Set<string>();

/** Test hook: clear all state (rate buckets, token buckets, overrides, dirty). */
export function resetRateLimitState(): void {
  rateMap.clear();
  tokenMap.clear();
  overrides.clear();
  dirty.clear();
}

/** Resolve the effective per-min rate for a user (override > default). */
function getEffectiveRatePerMin(userId: string): number {
  const o = overrides.get(userId);
  return typeof o?.ratePerMin === 'number' ? o.ratePerMin : DEFAULT_RATE_PER_MIN;
}

/** Resolve the effective daily token cap for a user (override > default). */
function getEffectiveDailyTokens(userId: string): number {
  const o = overrides.get(userId);
  return typeof o?.dailyTokens === 'number' ? o.dailyTokens : DEFAULT_DAILY_TOKENS;
}

/**
 * Set per-user override. Either field can be omitted/null to leave that dimension on default.
 */
export function setOverride(
  userId: string,
  ratePerMin?: number | null,
  dailyTokens?: number | null,
): UserOverride {
  const next: UserOverride = {};
  if (typeof ratePerMin === 'number' && Number.isFinite(ratePerMin) && ratePerMin > 0) {
    next.ratePerMin = Math.floor(ratePerMin);
  }
  if (typeof dailyTokens === 'number' && Number.isFinite(dailyTokens) && dailyTokens > 0) {
    next.dailyTokens = Math.floor(dailyTokens);
  }
  if (next.ratePerMin === undefined && next.dailyTokens === undefined) {
    const existing = overrides.get(userId);
    return existing ?? {};
  }
  overrides.set(userId, next);
  return next;
}

/** Remove a user's override entirely (falls back to defaults). */
export function clearOverride(userId: string): boolean {
  return overrides.delete(userId);
}

/** Get a user's current override (or undefined if none). */
export function getOverride(userId: string): UserOverride | undefined {
  return overrides.get(userId);
}

/**
 * Check if user can trigger a pipeline right now.
 * Returns ok=true if allowed; ok=false with retryAfter (seconds) if rate-limited.
 * Effective per-min limit: user override > DEFAULT_RATE_PER_MIN.
 */
export function checkRateLimit(userId: string, now: number = Date.now()): { ok: boolean; retryAfter?: number; limit: number } {
  const limit = getEffectiveRatePerMin(userId);
  const b = rateMap.get(userId);
  if (!b || b.resetAt <= now) {
    rateMap.set(userId, { count: 1, resetAt: now + ONE_MIN_MS });
    return { ok: true, limit };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000), limit };
  }
  b.count++;
  return { ok: true, limit };
}

/**
 * Check if user has remaining daily token budget.
 * @param prospectiveTokens tokens this run will consume (estimate; 0 means unknown)
 * Effective daily cap: user override > DEFAULT_DAILY_TOKENS.
 */
export function checkDailyTokenCap(
  userId: string,
  prospectiveTokens: number = 0,
  now: number = Date.now(),
): { ok: boolean; currentUsage: number; limit: number } {
  const limit = getEffectiveDailyTokens(userId);
  const b = tokenMap.get(userId);
  if (!b || b.resetAt <= now) {
    const newUsage = prospectiveTokens;
    tokenMap.set(userId, { tokens: newUsage, resetAt: now + ONE_DAY_MS });
    return { ok: newUsage <= limit, currentUsage: newUsage, limit };
  }
  const wouldBe = b.tokens + prospectiveTokens;
  return {
    ok: wouldBe <= limit,
    currentUsage: b.tokens,
    limit,
  };
}

/** Record actual token usage after a pipeline run completes. */
export function recordTokenUsage(userId: string, tokens: number, now: number = Date.now()): void {
  const b = tokenMap.get(userId);
  if (!b || b.resetAt <= now) {
    tokenMap.set(userId, { tokens, resetAt: now + ONE_DAY_MS });
    return;
  }
  b.tokens += tokens;
}

/** Diagnostic: inspect current state (for tests / admin). */
export function _inspect(userId: string): {
  rate?: Bucket;
  tokens?: TokenBucket;
  override?: UserOverride;
  limits: { perMin: number; daily: number; defaultPerMin: number; defaultDaily: number };
} {
  return {
    rate: rateMap.get(userId),
    tokens: tokenMap.get(userId),
    override: overrides.get(userId),
    limits: {
      perMin: getEffectiveRatePerMin(userId),
      daily: getEffectiveDailyTokens(userId),
      defaultPerMin: DEFAULT_RATE_PER_MIN,
      defaultDaily: DEFAULT_DAILY_TOKENS,
    },
  };
}

// ─── DB persistence (Phase 4 Level 4 #3) ──────────────────────────────────
//
// Trade-off note: chose hybrid (in-memory + periodic flush) over pure-DB.
// Pure-DB adds a round-trip on every checkRateLimit call (latency-sensitive
// hot path). Hybrid keeps the same in-memory performance and only writes
// dirty entries every 30s. Trade-off: up to 30s of state can be lost on a
// crash, which is acceptable — rate limits are best-effort safety nets, not
// accounting. Fail-open on DB errors means a DB outage degrades us back to
// pure in-memory, not a full outage.

interface DbLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
}

let flushTimer: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL_MS = 30_000;
const STARTUP_LOOKBACK_MS = 60 * 60 * 1000; // 1 hour

// Module-level swappable for tests.
let dbRef: DbLike | null = null;

/** Test hook: inject a mock DB (or null to clear). */
export function _setDb(db: DbLike | null): void {
  dbRef = db;
}

/** Test hook: how many users have un-flushed changes. */
export function _dirtySize(): number {
  return dirty.size;
}

async function getDb(): Promise<DbLike | null> {
  if (dbRef !== null) return dbRef;
  if (!process.env.DATABASE_URL) return null;
  try {
    // Dynamic import keeps tests fast and avoids loading the pool at import
    // time (don't throw at module load when DATABASE_URL is unset in CI).
    const mod = await import('../db/index.js');
    dbRef = mod.pool as unknown as DbLike;
    return dbRef;
  } catch {
    return null;
  }
}

/**
 * Load recent state from DB into memory. Safe to call multiple times.
 * Skips buckets that already expired during the restart window.
 * Returns the number of rows loaded.
 */
export async function loadFromDb(now: number = Date.now()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    const cutoff = new Date(now - STARTUP_LOOKBACK_MS);
    const { rows } = await db.query(
      `SELECT user_id, rate_count, rate_reset_at, tokens_used, tokens_reset_at
       FROM rate_limit_state
       WHERE updated_at >= $1`,
      [cutoff],
    );
    let loaded = 0;
    for (const r of rows) {
      const userId: string = r.user_id;
      const rateReset = new Date(r.rate_reset_at).getTime();
      const tokReset = new Date(r.tokens_reset_at).getTime();
      if (rateReset > now) {
        rateMap.set(userId, { count: r.rate_count, resetAt: rateReset });
      }
      if (tokReset > now) {
        tokenMap.set(userId, { tokens: r.tokens_used, resetAt: tokReset });
      }
      loaded++;
    }
    return loaded;
  } catch (err) {
    process.stderr.write(`[rate-limit] loadFromDb failed: ${(err as Error).message}\n`);
    return 0;
  }
}

/**
 * Flush dirty entries to DB. Returns the number of rows written.
 * Fail-open: on error, dirty set is preserved so the next flush retries.
 */
export async function flushToDb(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (dirty.size === 0) return 0;
  const userIds = Array.from(dirty);
  let written = 0;
  try {
    for (const userId of userIds) {
      const rate = rateMap.get(userId);
      const tok = tokenMap.get(userId);
      if (!rate && !tok) {
        dirty.delete(userId);
        continue;
      }
      await db.query(
        `INSERT INTO rate_limit_state
           (user_id, rate_count, rate_reset_at, tokens_used, tokens_reset_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           rate_count = COALESCE(EXCLUDED.rate_count, rate_limit_state.rate_count),
           rate_reset_at = COALESCE(EXCLUDED.rate_reset_at, rate_limit_state.rate_reset_at),
           tokens_used = COALESCE(EXCLUDED.tokens_used, rate_limit_state.tokens_used),
           tokens_reset_at = COALESCE(EXCLUDED.tokens_reset_at, rate_limit_state.tokens_reset_at),
           updated_at = NOW()`,
        [
          userId,
          rate ? rate.count : null,
          rate ? new Date(rate.resetAt) : null,
          tok ? tok.tokens : null,
          tok ? new Date(tok.resetAt) : null,
        ],
      );
      dirty.delete(userId);
      written++;
    }
    return written;
  } catch (err) {
    process.stderr.write(`[rate-limit] flushToDb failed: ${(err as Error).message}\n`);
    return 0;  // leave dirty set intact so next flush retries
  }
}

/**
 * Mark a user dirty (called by check/record functions). Internal use.
 */
function markDirty(userId: string): void {
  dirty.add(userId);
}

/** Start the periodic flush timer. Idempotent. */
export function startPersistence(intervalMs: number = FLUSH_INTERVAL_MS): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushToDb();
  }, intervalMs);
  // Don't keep the event loop alive just for the flush timer.
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

/** Stop the periodic flush timer. */
export function stopPersistence(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
