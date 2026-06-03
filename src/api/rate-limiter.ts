// Simple in-memory rate limiter for the HTTP API
// Protects against brute force and excessive API consumption

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private windowMs: number = 60000,   // 1 minute window
    private maxRequests: number = 100,   // 100 requests per window
    private cleanupIntervalMs: number = 300000, // cleanup every 5 min
  ) {
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    this.cleanupTimer.unref(); // don't keep process alive
  }

  /** Check if request is allowed. Returns true if under limit. */
  check(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxRequests - 1, resetIn: this.windowMs };
    }

    entry.count++;
    if (entry.count > this.maxRequests) {
      return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
    }

    return { allowed: true, remaining: this.maxRequests - entry.count, resetIn: entry.resetAt - now };
  }

  /** Reset a specific key (e.g. after successful auth). */
  reset(key: string): void {
    this.store.delete(key);
  }

  /** Periodic cleanup of expired entries. */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /** Stop cleanup timer. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
