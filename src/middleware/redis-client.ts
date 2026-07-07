/**
 * Redis client singleton (Phase 4 Level 12):
 * - Single shared connection per process; lazy-init on first use
 * - Reads REDIS_URL env (default redis://localhost:6379)
 * - Honors DISABLE_REDIS_RATE_LIMIT=1 → never connect, mark unavailable
 * - Health check via PING; failure marks client unavailable (re-checkable)
 * - Auto-reconnect on transient errors (built into node-redis v4+)
 *
 * Why a singleton: node-redis opens one TCP connection per client. Sharing
 * one client across request handlers avoids connection churn and the
 * 100-conn-per-instance Redis default soft cap.
 */

import { createClient, RedisClientType } from 'redis';

const DEFAULT_URL = 'redis://localhost:6379';

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType> | null = null;
let available = false;
let lastPingFailAt = 0;
const PING_RETRY_BACKOFF_MS = 30_000;

function isDisabled(): boolean {
  return process.env.DISABLE_REDIS_RATE_LIMIT === '1';
}

function getUrl(): string {
  return process.env.REDIS_URL || DEFAULT_URL;
}

/**
 * Get the Redis client. Lazy-connects on first call. Returns null when:
 * - DISABLE_REDIS_RATE_LIMIT=1 (operator disabled)
 * - Connection failed and the backoff window hasn't elapsed
 * - Last health check failed within the backoff window
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (isDisabled()) return null;
  if (client && available) return client;
  // Backoff after a recent failure so we don't hammer Redis during outage.
  if (!available && Date.now() - lastPingFailAt < PING_RETRY_BACKOFF_MS) return null;

  if (!client) {
    client = createClient({ url: getUrl() });
    client.on('error', (err: Error) => {
      // node-redis emits 'error' on transient disconnects; mark unavailable
      // so callers fall back to in-memory until reconnect succeeds.
      available = false;
      lastPingFailAt = Date.now();
      // eslint-disable-next-line no-console
      console.warn(`[redis-client] connection error: ${err.message}`);
    });
  }

  if (!connecting) {
    connecting = client.connect().then(async (c) => {
      try {
        await c.ping();
        available = true;
      } catch (e) {
        available = false;
        lastPingFailAt = Date.now();
        throw e;
      }
      return c;
    }).catch((err) => {
      available = false;
      lastPingFailAt = Date.now();
      // eslint-disable-next-line no-console
      console.warn(`[redis-client] connect failed: ${(err as Error).message}`);
      // Drop the bad client so next call gets a fresh one.
      try { client?.quit(); } catch { /* ignore */ }
      client = null;
      throw err;
    }).finally(() => {
      connecting = null;
    });
  }

  try {
    await connecting;
    return client;
  } catch {
    return null;
  }
}

/**
 * Synchronous availability check (best-effort; does not trigger a connection).
 * Use this from hot paths to short-circuit before async work when Redis is
 * known-unavailable.
 */
export function redisAvailable(): boolean {
  if (isDisabled()) return false;
  return available && client !== null;
}

/**
 * Probe Redis health with PING. Updates availability state. Cheap enough to
 * call from periodic maintenance (e.g. cron).
 */
export async function pingRedis(): Promise<boolean> {
  const c = await getRedisClient();
  if (!c) return false;
  try {
    await c.ping();
    available = true;
    return true;
  } catch (err) {
    available = false;
    lastPingFailAt = Date.now();
    // eslint-disable-next-line no-console
    console.warn(`[redis-client] ping failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Test hook: reset all module state (client, availability, backoff).
 */
export function _resetRedisClientForTests(): void {
  try { client?.quit(); } catch { /* ignore */ }
  client = null;
  connecting = null;
  available = false;
  lastPingFailAt = 0;
}
