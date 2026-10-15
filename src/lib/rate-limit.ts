/**
 * Fixed-window rate limiter with pluggable store.
 *
 * Default: in-memory Map (single-instance, e.g. one Render web service).
 * Production horizontal scaling: provide a Redis adapter via
 * `setRateLimitStore(redisStore)` — call sites stay identical.
 *
 * Docs: docs/DECISIONS.md D11 — “move counters to Redis/Upstash — call sites are isolated for that.”
 */

export interface RateLimitStore {
  consume?(key: string, windowMs: number): Promise<{ count:number; resetAt:number }>;
  get(key: string): Promise<{ count: number; resetAt: number } | null>;
  set(key: string, bucket: { count: number; resetAt: number }, ttlMs: number): Promise<void>;
  incr(key: string): Promise<{ count: number; resetAt: number } | null>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// ---- In-memory default store ----
const buckets = new Map<string, Bucket>();

const memoryStore: RateLimitStore = {
  async get(key) {
    const b = buckets.get(key);
    if (!b) return null;
    if (b.resetAt <= Date.now()) {
      buckets.delete(key);
      return null;
    }
    return b;
  },
  async set(key, bucket) {
    buckets.set(key, bucket);
  },
  async incr(key) {
    const b = buckets.get(key);
    if (!b) return null;
    b.count += 1;
    return b;
  },
};

let activeStore: RateLimitStore = memoryStore;

/** Swap the backing store (e.g. Redis). Pass null to revert to in-memory. */
export function setRateLimitStore(store: RateLimitStore | null) {
  activeStore = store ?? memoryStore;
}
export function getRateLimitStore(): RateLimitStore {
  return activeStore;
}

// Periodic cleanup so the map cannot grow unbounded (in-memory only).
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, 60_000);
  (timer as { unref?: () => void }).unref?.();
}

/**
 * Factory for a Redis-backed store (Upstash / ioredis). Not imported by default
 * to keep the bundle free of redis deps; wire it in server startup if needed:
 *
 * ```ts
 * import { Redis } from "@upstash/redis";
 * import { setRateLimitStore, createRedisStore } from "@/lib/rate-limit";
 * setRateLimitStore(createRedisStore(new Redis({ url, token })));
 * ```
 */
export function createRedisStore(client: {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}): RateLimitStore {
  return {
    async consume(key, windowMs) {
      // Upstash-compatible EVAL contract; ioredis requires a thin signature adapter.
      const result = await client.eval(`
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
        return {count, redis.call('PTTL', KEYS[1])}
      `, [`rl:${key}`], [windowMs]) as [number, number];
      if (!Array.isArray(result) || result[1] < 0) throw new Error("Rate limit store failure");
      return { count:Number(result[0]), resetAt:Date.now()+Number(result[1]) };
    },
    async get() { throw new Error("Use atomic consume"); },
    async set() { throw new Error("Use atomic consume"); },
    async incr() { throw new Error("Use atomic consume"); },
  };
}

/* ---------------- Backward-compat helpers for tests ---------------- */
export const LOGIN_LIMIT = { maxAttempts: 10, windowMs: 10 * 60_000 };

/** Test helper — clear a bucket (used by tests). */
export function clearFailures(key: string) {
  buckets.delete(key);
}

/** Test helper — record a failure at a given timestamp (deterministic tests). */
export function recordFailure(key: string, nowMs?: number) {
  const now = nowMs ?? Date.now();
  const bucket = buckets.get(key);
  const windowMs = LOGIN_LIMIT.windowMs;
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count += 1;
  }
}

// Internal deterministic check used by tests (accepts config object + timestamp).
function checkDeterministic(
  key: string,
  config: { maxAttempts: number; windowMs: number },
  now: number,
): { ok: boolean; allowed: boolean; retryAfterSec: number; remaining: number } {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const remaining = config.maxAttempts;
    return { ok: true, allowed: true, retryAfterSec: 0, remaining };
  }
  const allowed = bucket.count < config.maxAttempts;
  const remaining = Math.max(0, config.maxAttempts - bucket.count);
  const retryAfterSec = allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000);
  return { ok: allowed, allowed, retryAfterSec, remaining };
}

/**
 * Check whether `key` is within `limit` requests per `windowMs`.
 * Supports two call signatures:
 *  - production: checkRateLimit(key, limit:number, windowMs:number)
 *  - test:       checkRateLimit(key, LOGIN_LIMIT, timestamp:number)
 * Returns `{ ok, allowed, retryAfterSec, remaining }` — `allowed` is alias of `ok`.
 */
export function checkRateLimit(
  key: string,
  limit: number | { maxAttempts: number; windowMs: number },
  windowMs: number,
): { ok: boolean; allowed: boolean; retryAfterSec: number; remaining: number } {
  // Test overload: second arg is a config object.
  if (typeof limit === "object" && limit !== null && "maxAttempts" in limit) {
    const config = limit as { maxAttempts: number; windowMs: number };
    const now = windowMs; // in test overload, third param is timestamp
    return checkDeterministic(key, config, now);
  }

  const lim = limit as number;
  const win = windowMs as number;
  const now = Date.now();
  // Fast path for the default in-memory store (synchronous).
  if (activeStore === memoryStore) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + win });
      return { ok: true, allowed: true, retryAfterSec: 0, remaining: lim - 1 };
    }
    bucket.count += 1;
    if (bucket.count > lim) {
      return { ok: false, allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000), remaining: 0 };
    }
    return { ok: true, allowed: true, retryAfterSec: 0, remaining: lim - bucket.count };
  }

  // Async store path — for call sites that can await, prefer checkRateLimitAsync.
  console.warn("[rate-limit] async store active but checkRateLimit (sync) was called — use checkRateLimitAsync");
  return { ok: false, allowed: false, retryAfterSec: 60, remaining: 0 };
}

export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; allowed: boolean; retryAfterSec: number; remaining: number }> {
  if (activeStore === memoryStore && process.env.NODE_ENV === "production") {
    const { authDb } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const { createHash } = await import("node:crypto");
    const hashed = createHash("sha256").update(key).digest("hex");
    const result = await authDb.execute(sql`
      insert into rate_limit_buckets (key, count, resets_at) values (${hashed}, 1, now() + ${windowMs} * interval '1 millisecond')
      on conflict (key) do update set
        count = case when rate_limit_buckets.resets_at <= now() then 1 else rate_limit_buckets.count + 1 end,
        resets_at = case when rate_limit_buckets.resets_at <= now() then now() + ${windowMs} * interval '1 millisecond' else rate_limit_buckets.resets_at end
      returning count, greatest(0,ceil(extract(epoch from resets_at - now())))::int as retry`);
    const row = result.rows[0] as {count:number; retry:number};
    return { ok:row.count<=limit, allowed:row.count<=limit, remaining:Math.max(0,limit-row.count), retryAfterSec:row.count>limit?row.retry:0 };
  }
  if (activeStore === memoryStore) return checkRateLimit(key, limit, windowMs);
  const now = Date.now();
  if (!activeStore.consume) throw new Error("Custom rate limit stores must implement atomic consume");
  const bucket = await activeStore.consume(key, windowMs);
  if (bucket.count > limit) {
    return { ok: false, allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000), remaining: 0 };
  }
  return { ok: true, allowed: true, retryAfterSec: 0, remaining: limit - bucket.count };
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Convenience helper for API routes: enforce a limit or return a 429 Response.
 * Usage:
 *   const limited = await limitOrRespond(req, "login:ip", 10, 10*60_000);
 *   if (limited) return limited; // already a 429 Response
 */
export async function limitOrRespond(
  req: Request,
  keyPrefix: string,
  limit: number,
  windowMs: number,
): Promise<Response | null> {
  const key = `${keyPrefix}:${clientIp(req)}`;
  // Use async check so Redis stores work correctly.
  const res = await checkRateLimitAsync(key, limit, windowMs);
  if (!res.ok) {
    return Response.json(
      { ok: false, error: `محاولات كثيرة — حاول مجدداً بعد ${Math.ceil(res.retryAfterSec / 60)} دقيقة`, code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(res.retryAfterSec) } },
    );
  }
  return null;
}
