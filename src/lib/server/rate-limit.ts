/**
 * Simple in-memory sliding-window rate limiter.
 * Note: This is per-isolate — each Cloudflare Worker isolate gets its own limiter.
 * For distributed rate limiting, upgrade to Cloudflare Rate Limiting rules or Durable Objects.
 */
export class RateLimiter {
  private windows = new Map<string, number[]>();
  private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {
    this._cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  check(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.windows.get(key);
    if (timestamps) {
      timestamps = timestamps.filter((t) => t > windowStart);
      this.windows.set(key, timestamps);
    } else {
      timestamps = [];
      this.windows.set(key, timestamps);
    }

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      return { allowed: false, retryAfterMs: oldestInWindow + this.windowMs - now };
    }

    timestamps.push(now);
    return { allowed: true };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.windows) {
      const valid = timestamps.filter((t) => t > now - this.windowMs);
      if (valid.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, valid);
      }
    }
  }
}
