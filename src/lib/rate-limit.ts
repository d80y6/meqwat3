/**
 * Minimal in-memory sliding-window rate limiter (per process).
 * Suitable for a single-instance deployment; for multi-instance production
 * back it with Redis. Keys are cheap to create and self-expire.
 */
interface Bucket { hits: number[] }
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, maxHits: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= maxHits) {
    const oldest = bucket.hits[0];
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  // Opportunistic cleanup to bound memory.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function rateLimitReset(key: string): void {
  buckets.delete(key);
}
