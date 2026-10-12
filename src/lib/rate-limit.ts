/**
 * In-memory sliding-window rate limiter (per key).
 * Suitable for a single application instance; behind multiple replicas use
 * a shared store (Redis) with the same interface. Keys are typically
 * `login:<ip>:<email>` so credential stuffing against one account and
 * password spraying from one IP are both throttled.
 */
interface Bucket {
  failures: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
  now = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true, retryAfterSec: 0, remaining: opts.maxAttempts };
  const fresh = bucket.failures.filter((t) => now - t < opts.windowMs);
  bucket.failures = fresh;
  if (fresh.length >= opts.maxAttempts) {
    const oldest = fresh[0];
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000)),
      remaining: 0,
    };
  }
  return { allowed: true, retryAfterSec: 0, remaining: opts.maxAttempts - fresh.length };
}

export function recordFailure(key: string, now = Date.now()): void {
  const bucket = buckets.get(key) ?? { failures: [] };
  bucket.failures.push(now);
  buckets.set(key, bucket);
  // Opportunistic cleanup so the map cannot grow unboundedly.
  if (buckets.size > 5000) {
    const cutoff = now - 60 * 60_000;
    for (const [k, b] of buckets) {
      if (b.failures.every((t) => t < cutoff)) buckets.delete(k);
    }
  }
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}

/** Login policy: 5 failed attempts per 15 minutes per (IP, account). */
export const LOGIN_LIMIT: RateLimitOptions = { maxAttempts: 5, windowMs: 15 * 60_000 };
