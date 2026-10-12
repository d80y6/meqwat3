import { describe, it, expect } from "vitest";
import { toCents, fromCents, addMoney, subMoney, mulQtyPrice, toMilliQty, fromMilliQty, addQty } from "../src/lib/money";

describe("exact decimal money arithmetic", () => {
  it("parses decimal strings without float error", () => {
    expect(toCents("0.1") + toCents("0.2")).toBe(toCents("0.3"));
    expect(toCents("12000.50")).toBe(1200050);
    expect(toCents("")).toBe(0);
    expect(toCents(null)).toBe(0);
    expect(toCents("-250.75")).toBe(-25075);
  });

  it("round-trips cents exactly", () => {
    for (const v of ["0.01", "999999999.99", "15000", "0.10", "7.07"]) {
      expect(fromCents(toCents(v))).toBe(v.includes(".") ? v : `${v}.00`);
    }
  });

  it("adds and subtracts money exactly", () => {
    expect(addMoney("100.10", "0.20")).toBe("100.30");
    expect(subMoney("50000", "31500.55")).toBe("18499.45");
    expect(addMoney("0.1", "0.2")).toBe("0.30");
  });

  it("multiplies fractional quantities by prices exactly", () => {
    expect(mulQtyPrice("2.5", "12000")).toBe("30000.00");
    expect(mulQtyPrice("0.333", "100")).toBe("33.30");
    expect(mulQtyPrice("3", "4500.50")).toBe("13501.50");
    expect(mulQtyPrice("0", "9999")).toBe("0.00");
  });

  it("handles quantities in milli-units", () => {
    expect(toMilliQty("1.5")).toBe(1500);
    expect(fromMilliQty(1500)).toBe("1.5");
    expect(addQty("40", "25.5")).toBe("65.5");
  });

  it("is safe for large Yemeni Rial amounts", () => {
    expect(addMoney("99999999.99", "0.01")).toBe("100000000.00");
  });
});

describe("permission matrix", () => {
  it("restricts cashiers and grants owners full tenant access", async () => {
    const { hasPermission } = await import("../src/lib/permissions");
    expect(hasPermission("cashier", "pos:use")).toBe(true);
    expect(hasPermission("cashier", "users:manage")).toBe(false);
    expect(hasPermission("cashier", "purchases:manage")).toBe(false);
    expect(hasPermission("manager", "users:manage")).toBe(false);
    expect(hasPermission("tenant_owner", "users:manage")).toBe(true);
    expect(hasPermission("platform_admin", "admin:tenants")).toBe(true);
    expect(hasPermission("tenant_owner", "admin:tenants")).toBe(false);
  });
});
