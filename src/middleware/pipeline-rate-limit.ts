/**
 * Pipeline Rate Limiter (Phase 4 Level 3 Fix 2 + Level 4 #3):
 * - Per-user rolling 1-minute rate limit (default 10/min)
 * - Per-user rolling daily token cap (default 100,000 tokens/day)
 * - In-memory Map for hot path; DB persistence to survive pm2 reloads.
 * - Fail-open: if DB is down, in-memory state still works (warn logged).
 * - Configurable via env: PIPELINE_RATE_LIMIT_PER_MIN, PIPELINE_DAILY_TOKEN_LIMIT
 */

const DEFAULT_RATE_PER_MIN = Number(process.env.PIPELINE_RATE_LIMIT_PER_MIN) || 10;
const DEFAULT_DAILY_TOKENS = Number(process.env.PIPELINE_DAILY_TOKEN_LIMIT) || 100_000;
const ONE_MIN_MS = 60_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// How far back to load state on startup (skip ancient buckets).
const STARTUP_LOOKBACK_MS = 60 * 60 * 1000; // 1 hour

interface Bucket { count: number; resetAt: number; }
interface TokenBucket { tokens: number; resetAt: number; }

const rateMap = new Map<string, Bucket>();
const tokenMap = new Map<string, TokenBucket>();
// Track which users changed since last flush - only persist dirty entries.
const dirty = new Set<string>();

let flushTimer: NodeJS.Timeout | null = null;

/** Test hook: clear all state */
export function resetRateLimitState(): void {
  rateMap.clear();
  tokenMap.clear();
  dirty.clear();
}

/**
 * Check if user can trigger a pipeline right now.
 * Returns ok=true if allowed; ok=false with retryAfter (seconds) if rate-limited.
 */
export function checkRateLimit(userId: string, now: number = Date.now()): { ok: boolean; retryAfter?: number } {
  const b = rateMap.get(userId);
  if (!b || b.resetAt <= now) {
    rateMap.set(userId, { count: 1, resetAt: now + ONE_MIN_MS });
    dirty.add(userId);
    return { ok: true };
  }
  if (b.count >= DEFAULT_RATE_PER_MIN) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  dirty.add(userId);
  return { ok: true };
}

/**
 * Check if user has remaining daily token budget.
 * @param prospectiveTokens tokens this run will consume (estimate; 0 means unknown)
 */
export function checkDailyTokenCap(
  userId: string,
  prospectiveTokens: number = 0,
  now: number = Date.now(),
): { ok: boolean; currentUsage: number; limit: number } {
  const b = tokenMap.get(userId);
  if (!b || b.resetAt <= now) {
    const newUsage = prospectiveTokens;
    tokenMap.set(userId, { tokens: newUsage, resetAt: now + ONE_DAY_MS });
    dirty.add(userId);
    return { ok: newUsage <= DEFAULT_DAILY_TOKENS, currentUsage: newUsage, limit: DEFAULT_DAILY_TOKENS };
  }
  const wouldBe = b.tokens + prospectiveTokens;
  return {
    ok: wouldBe <= DEFAULT_DAILY_TOKENS,
    currentUsage: b.tokens,
    limit: DEFAULT_DAILY_TOKENS,
  };
}

/** Record actual token usage after a pipeline run completes. */
export function recordTokenUsage(userId: string, tokens: number, now: number = Date.now()): void {
  const b = tokenMap.get(userId);
  if (!b || b.resetAt <= now) {
    tokenMap.set(userId, { tokens, resetAt: now + ONE_DAY_MS });
    dirty.add(userId);
    return;
  }
  b.tokens += tokens;
  dirty.add(userId);
}

/** Diagnostic: inspect current state (for tests / admin). */
export function _inspect(userId: string): { rate?: Bucket; tokens?: TokenBucket; limits: { perMin: number; daily: number } } {
  return {
    rate: rateMap.get(userId),
    tokens: tokenMap.get(userId),
    limits: { perMin: DEFAULT_RATE_PER_MIN, daily: DEFAULT_DAILY_TOKENS },
  };
}

// --- DB persistence (Phase 4 Level 4 #3) ---
//
// Trade-off note: chose hybrid (in-memory + periodic flush) over pure-DB.
// Pure-DB adds a round-trip on every checkRateLimit call (latency-sensitive
// hot path). Hybrid keeps the same in-memory performance and only writes
// dirty entries every 30s. Trade-off: up to 30s of state can be lost on a
// crash, which is acceptable - rate limits are best-effort safety nets, not
// accounting. Fail-open on DB errors means a DB outage degrades us back to
// pure in-memory, not a full outage.

interface DbLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
}

// Module-level swappable for tests.
let dbRef: DbLike | null = null;

/** Test hook: inject a mock DB (or null to clear). */
export function _setDb(db: DbLike | null): void {
  dbRef = db;
}

async function getDb(): Promise<DbLike | null> {
  if (dbRef !== null) return dbRef;
  if (!process.env.DATABASE_URL) return null;
  try {
    // Dynamic import keeps tests fast and avoids loading the pool at import
    // time (don't throw at module load when DATABASE_URL is unset in CI).
    const mod = await import('../db/index.js');
    dbRef = mod.pool as DbLike;
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
      // UPSERT. COALESCE preserves the existing column when the in-memory
      // bucket is missing (e.g. token cap cleared but rate bucket active).
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
    return written;
  }
}

/** Start periodic flush. Idempotent. */
export function startPersistence(intervalMs: number = 30_000): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushToDb().catch((err) => {
      process.stderr.write(`[rate-limit] periodic flush error: ${(err as Error).message}\n`);
    });
  }, intervalMs);
  // Don't keep the event loop alive just for the flush timer.
  flushTimer.unref?.();
}

/** Stop periodic flush (for tests / graceful shutdown). */
export function stopPersistence(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/** Test hook: read dirty set size. */
export function _dirtySize(): number {
  return dirty.size;
}
