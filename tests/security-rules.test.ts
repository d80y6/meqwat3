import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { allowedMutationOrigin } from "../src/lib/csrf";
import { toCents, toMilliQty, mulQtyPrice, fromCents, roundRatio } from "../src/lib/money";
import { checkRateLimitAsync } from "../src/lib/rate-limit";

describe("strict financial inputs", () => {
  it.each(["1e3", "NaN", "Infinity", "12xyz", "1.2.3", "1,000", "--2", "0x10", true, {}, []])("rejects malformed decimal %j", v => {
    expect(() => toCents(v as string)).toThrow(RangeError);
  });
  it("rejects precision/storage overflow rather than disagreeing with PostgreSQL", () => {
    expect(() => toCents("1.001")).toThrow();
    expect(() => toMilliQty("0.0009")).toThrow();
    expect(() => toCents("1000000000000")).toThrow();
    expect(() => fromCents(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
  it("uses bigint intermediate products and exact cent rounding", () => {
    expect(mulQtyPrice("12345678.123", "12345.67")).toBe("152415668032.78");
    expect(roundRatio(1n, 2n)).toBe(1);
    expect(roundRatio(-1n, 2n)).toBe(-1);
  });
});

describe("CSRF policy", () => {
  beforeEach(()=>vi.stubEnv("APP_ORIGIN","https://shop.example"));
  afterEach(()=>vi.unstubAllEnvs());
  const req = (headers: Record<string,string>) => new Request("https://shop.example/api/sales", {method:"POST",headers});
  it("rejects cross-origin and sibling-origin cookie mutations", () => {
    expect(allowedMutationOrigin(req({origin:"https://evil.example","sec-fetch-site":"same-site"}))).toBe(false);
    expect(allowedMutationOrigin(req({"sec-fetch-site":"cross-site"}))).toBe(false);
    expect(allowedMutationOrigin(req({origin:"null"}))).toBe(false);
  });
  it("allows same-origin browser and explicit native clients", () => {
    expect(allowedMutationOrigin(req({origin:"https://shop.example"}))).toBe(true);
    expect(allowedMutationOrigin(req({}))).toBe(true);
  });
  it("atomic memory limiter admits exactly the budget concurrently", async () => {
    const results = await Promise.all(Array.from({length:30}, () => checkRateLimitAsync(`burst-${process.pid}`, 10, 60000)));
    expect(results.filter(r=>r.ok)).toHaveLength(10);
  });
});

describe('Yemen business date boundaries',()=>{
  it('includes the full selected last calendar day and is independent of UTC server time',async()=>{
    const {businessDateBoundary,businessDayStart}=await import('../src/lib/business-date');
    expect(businessDateBoundary('2026-10-15')?.toISOString()).toBe('2026-10-14T21:00:00.000Z');
    expect(businessDateBoundary('2026-10-15',true)?.toISOString()).toBe('2026-10-15T20:59:59.999Z');
    expect(businessDayStart(0,new Date('2026-10-14T22:00:00Z')).toISOString()).toBe('2026-10-14T21:00:00.000Z');
    expect(()=>businessDateBoundary('2026-02-31')).toThrow();
  });
});
