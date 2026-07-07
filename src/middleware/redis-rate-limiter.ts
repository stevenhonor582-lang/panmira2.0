/**
 * Redis-backed rate limiter primitives (Phase 4 Level 12):
 * - Sliding-window-ish counter via INCR + EXPIRE (Lua-atomic)
 * - Daily token cap keyed by UTC day (rolls over at midnight UTC)
 * - Returns the same shape as in-memory fallback so callers are agnostic
 *
 * Why Lua: node-redis splits INCR and EXPIRE into two round-trips; without
 * atomicity the key can leak forever when INCR succeeds but EXPIRE doesn't.
 * EVAL ensures both run as a single op.
 *
 * Key layout:
 * - rl:rate:{userId}         -> count, expires after windowMs
 * - rl:tokens:{userId}:{day} -> token usage, expires at end of UTC day + 1h buffer
 *
 * Lua scripts:
 * - INCR_AND_TOUCH: KEYS=[bucket], ARGV=[ttlSec, increment] -> [current, ttl]
 *   Used by the rate-count check (increment=1) and token recording.
 * - GET_BUCKET: KEYS=[bucket] -> [current] (returns 0 if missing)
 *   Used by the token-cap check (read-only, matches in-memory semantics).
 */

import type { RedisClientType } from 'redis';
import { getRedisClient } from './redis-client.js';

const SCRIPT_INCR_AND_TOUCH = `
local current = redis.call('INCRBY', KEYS[1], tonumber(ARGV[2]))
if tonumber(ARGV[1]) > 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

const SCRIPT_GET_BUCKET = `
local v = redis.call('GET', KEYS[1])
if not v then return 0 end
return tonumber(v)
`;

const RATE_KEY_PREFIX = 'rl:rate:';
const TOKENS_KEY_PREFIX = 'rl:tokens:';

/** UTC day in YYYYMMDD form. */
export function utcDay(now: number = Date.now()): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function rateKey(userId: string): string {
  return `${RATE_KEY_PREFIX}${userId}`;
}

function tokensKey(userId: string, day: string): string {
  return `${TOKENS_KEY_PREFIX}${userId}:${day}`;
}

/** Seconds remaining until end of UTC day + 1h buffer (so day-of tokens don't expire mid-pipeline). */
function secondsUntilEndOfUtcDay(now: number = Date.now()): number {
  const d = new Date(now);
  const endOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  // +1h buffer so a long pipeline finishing after midnight still gets counted.
  return Math.max(60, Math.ceil((endOfDay - now) / 1000) + 3600);
}

export interface RateCheckResult {
  ok: boolean;
  count: number;
  retryAfter: number;
  limit: number;
}

/**
 * Sliding-window-ish rate check. INCR (by 1) + EXPIRE atomically. On retry,
 * retryAfter comes from the bucket's actual TTL.
 *
 * @param userId    rate-limit subject
 * @param limit     max events per window
 * @param windowMs  window size in milliseconds
 */
export async function checkRedisRateLimit(
  userId: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): Promise<RateCheckResult> {
  const c: RedisClientType | null = await getRedisClient();
  if (!c) throw new Error('redis unavailable');
  const key = rateKey(userId);
  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
  const result = (await c.eval(SCRIPT_INCR_AND_TOUCH, {
    keys: [key],
    arguments: [String(ttlSec), '1'],
  })) as [number, number];
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  const ok = count <= limit;
  return {
    ok,
    count,
    retryAfter: ttl > 0 ? ttl : ttlSec,
    limit,
  };
  // now is unused but kept for symmetry with in-memory fallback signature
  void now;
}

export interface TokenCapCheckResult {
  ok: boolean;
  currentUsage: number;
  limit: number;
}

/**
 * Check if adding `prospectiveTokens` would exceed the daily cap. Read-only
 * (matches in-memory semantics — does not record usage). Callers must invoke
 * recordRedisTokenUsage on commit.
 */
export async function checkRedisDailyTokenCap(
  userId: string,
  prospectiveTokens: number,
  limit: number,
  now: number = Date.now(),
): Promise<TokenCapCheckResult> {
  const c: RedisClientType | null = await getRedisClient();
  if (!c) throw new Error('redis unavailable');
  const day = utcDay(now);
  const key = tokensKey(userId, day);
  // Touch TTL on read so an active user's bucket doesn't disappear mid-day.
  // (No-op when TTL already set; cheap if already has TTL.)
  const ttlSec = secondsUntilEndOfUtcDay(now);
  // GET the current usage (returns 0 if missing). Touch the TTL via EXPIRE
  // (XX = only update if key has TTL set; matches "don't create on read").
  const currentStr = (await c.eval(SCRIPT_GET_BUCKET, { keys: [key] })) as number | string;
  const current = Number(currentStr) || 0;
  if (current > 0) {
    try { await c.expire(key, ttlSec); } catch { /* best-effort */ }
  }
  const wouldBe = current + Math.max(0, prospectiveTokens);
  return {
    ok: wouldBe <= limit,
    currentUsage: current,
    limit,
  };
  // now is unused but kept for signature symmetry
  void now;
}

/**
 * Record actual token usage after a pipeline run. INCRBY + EXPIRE atomically.
 */
export async function recordRedisTokenUsage(
  userId: string,
  tokens: number,
  now: number = Date.now(),
): Promise<void> {
  const c: RedisClientType | null = await getRedisClient();
  if (!c) throw new Error('redis unavailable');
  if (tokens <= 0) return;
  const day = utcDay(now);
  const key = tokensKey(userId, day);
  const ttlSec = secondsUntilEndOfUtcDay(now);
  await c.eval(SCRIPT_INCR_AND_TOUCH, {
    keys: [key],
    arguments: [String(ttlSec), String(Math.floor(tokens))],
  });
}

/** Test hook: wipe all rate-limit keys for a user (both windows). */
export async function resetRedisRateLimitForTests(userId: string): Promise<void> {
  const c: RedisClientType | null = await getRedisClient();
  if (!c) return;
  const day = utcDay();
  await c.del([rateKey(userId), tokensKey(userId, day)]);
}
