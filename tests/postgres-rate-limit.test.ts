import { describe,it,expect,vi } from "vitest";
import { randomUUID,createHash } from "node:crypto";
import { checkRateLimitAsync } from "../src/lib/rate-limit";
import { pool } from "../src/db";
const suite=process.env.DATABASE_URL?describe:describe.skip;
suite("atomic shared PostgreSQL limiter",()=>{
  it("admits exactly ten out of thirty concurrent attempts",async()=>{
    const key=`rate-audit-${randomUUID()}`;
    vi.stubEnv("NODE_ENV","production");
    try {
      const results=await Promise.all(Array.from({length:30},()=>checkRateLimitAsync(key,10,60000)));
      expect(results.filter(r=>r.ok)).toHaveLength(10);
      expect(results.filter(r=>!r.ok).every(r=>r.retryAfterSec>0)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      await pool.query("delete from rate_limit_buckets where key=$1",[createHash('sha256').update(key).digest('hex')]);
    }
  });
});
