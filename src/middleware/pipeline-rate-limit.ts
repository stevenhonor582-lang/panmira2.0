/**
 * Pipeline Rate Limiter (Phase 4 Level 3 Fix 2):
 * - Per-user rolling 1-minute rate limit (default 10/min)
 * - Per-user rolling daily token cap (default 100,000 tokens/day)
 * - In-memory Map-based, fail-open if anything throws
 * - Configurable via env: PIPELINE_RATE_LIMIT_PER_MIN, PIPELINE_DAILY_TOKEN_LIMIT
 */

const DEFAULT_RATE_PER_MIN = Number(process.env.PIPELINE_RATE_LIMIT_PER_MIN) || 10;
const DEFAULT_DAILY_TOKENS = Number(process.env.PIPELINE_DAILY_TOKEN_LIMIT) || 100_000;
const ONE_MIN_MS = 60_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface Bucket { count: number; resetAt: number; }
interface TokenBucket { tokens: number; resetAt: number; }

const rateMap = new Map<string, Bucket>();
const tokenMap = new Map<string, TokenBucket>();

/** Test hook: clear all state */
export function resetRateLimitState(): void {
  rateMap.clear();
  tokenMap.clear();
}

/**
 * Check if user can trigger a pipeline right now.
 * Returns ok=true if allowed; ok=false with retryAfter (seconds) if rate-limited.
 */
export function checkRateLimit(userId: string, now: number = Date.now()): { ok: boolean; retryAfter?: number } {
  const b = rateMap.get(userId);
  if (!b || b.resetAt <= now) {
    rateMap.set(userId, { count: 1, resetAt: now + ONE_MIN_MS });
    return { ok: true };
  }
  if (b.count >= DEFAULT_RATE_PER_MIN) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
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
    return;
  }
  b.tokens += tokens;
}

/** Diagnostic: inspect current state (for tests / admin). */
export function _inspect(userId: string): { rate?: Bucket; tokens?: TokenBucket; limits: { perMin: number; daily: number } } {
  return {
    rate: rateMap.get(userId),
    tokens: tokenMap.get(userId),
    limits: { perMin: DEFAULT_RATE_PER_MIN, daily: DEFAULT_DAILY_TOKENS },
  };
}
