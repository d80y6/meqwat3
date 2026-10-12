import { describe, it, expect, vi } from "vitest";

// No SMTP in the test environment: delivery must honestly report not-sent
// (never fake delivery) and must not throw.
describe("credential email delivery", () => {
  it("reports log-only (not sent) when SMTP is not configured", async () => {
    delete process.env.SMTP_HOST;
    vi.resetModules();
    const { sendOwnerCredentials, isEmailConfigured } = await import("../src/lib/email");
    expect(isEmailConfigured()).toBe(false);
    const res = await sendOwnerCredentials({
      to: "owner@example.ye",
      ownerName: "مالك تجريبي",
      tenantName: "متجر تجريبي",
      tempPassword: "Meqwat@abcd1234",
    });
    expect(res.sent).toBe(false);
    expect(res.via).toBe("log-only");
  });
});
