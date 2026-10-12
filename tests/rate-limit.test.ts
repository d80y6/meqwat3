import { describe, it, expect } from "vitest";
import { checkRateLimit, recordFailure, clearFailures, LOGIN_LIMIT } from "../src/lib/rate-limit";

describe("login rate limiter", () => {
  it("allows attempts under the threshold and blocks at it", () => {
    const key = "login:1.2.3.4:test@x.ye";
    clearFailures(key);
    const t0 = 1_000_000;
    for (let i = 0; i < LOGIN_LIMIT.maxAttempts; i++) {
      expect(checkRateLimit(key, LOGIN_LIMIT, t0 + i).allowed).toBe(true);
      recordFailure(key, t0 + i);
    }
    const blocked = checkRateLimit(key, LOGIN_LIMIT, t0 + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("window slides: old failures expire", () => {
    const key = "login:1.2.3.4:slide@x.ye";
    clearFailures(key);
    const t0 = 5_000_000;
    for (let i = 0; i < LOGIN_LIMIT.maxAttempts; i++) recordFailure(key, t0);
    expect(checkRateLimit(key, LOGIN_LIMIT, t0 + 1000).allowed).toBe(false);
    // After the full window passes, attempts are allowed again.
    expect(checkRateLimit(key, LOGIN_LIMIT, t0 + LOGIN_LIMIT.windowMs + 1).allowed).toBe(true);
  });

  it("clearing on success resets the counter", () => {
    const key = "login:9.9.9.9:ok@x.ye";
    clearFailures(key);
    const t0 = 9_000_000;
    recordFailure(key, t0);
    recordFailure(key, t0);
    clearFailures(key);
    expect(checkRateLimit(key, LOGIN_LIMIT, t0).remaining).toBe(LOGIN_LIMIT.maxAttempts);
  });

  it("keys are independent per account/IP", () => {
    const a = "login:1.1.1.1:a@x.ye";
    const b = "login:2.2.2.2:b@x.ye";
    clearFailures(a); clearFailures(b);
    const t0 = 12_000_000;
    for (let i = 0; i < LOGIN_LIMIT.maxAttempts; i++) recordFailure(a, t0);
    expect(checkRateLimit(a, LOGIN_LIMIT, t0).allowed).toBe(false);
    expect(checkRateLimit(b, LOGIN_LIMIT, t0).allowed).toBe(true);
  });
});
