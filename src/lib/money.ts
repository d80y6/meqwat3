/**
 * Exact decimal money arithmetic.
 *
 * PostgreSQL numeric(14,2) values arrive in JS as strings. All arithmetic is
 * performed on integer minor units (1 Rial = 100) so floating point error can
 * never leak into financial records. Quantities use milli-units (1/1000).
 */

export type MoneyInput = string | number | null | undefined;

/** Strict decimal parser. Never silently reinterpret NaN, exponent or junk input. */
function scaled(value: MoneyInput, scale: number, max: bigint): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value !== "string" && typeof value !== "number") throw new RangeError("Invalid decimal");
  const s = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(s) || s.length > 40) throw new RangeError("Invalid decimal");
  const negative = s.startsWith("-");
  const [whole, rawFraction = ""] = s.replace(/^-/, "").split(".");
  const frac = rawFraction.replace(/0+$/, "");
  if (frac.length > scale) throw new RangeError("Excess decimal precision");
  const n = BigInt(whole) * (10n ** BigInt(scale)) + BigInt(frac.padEnd(scale, "0"));
  if (n > max) throw new RangeError("Decimal outside database range");
  return Number(negative ? -n : n);
}

export function toCents(value: MoneyInput): number {
  return scaled(value, 2, 99999999999999n);
}

/** Exact half-away-from-zero division; intermediates cannot overflow JS doubles. */
export function roundRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new RangeError("Invalid denominator");
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const result = (n + denominator / 2n) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Unsafe integer");
  return Number(negative ? -result : result);
}

/** Convert integer minor units back to a canonical "1234.50" string. */
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 99999999999999) throw new RangeError("Money outside database range");
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${intPart}.${frac}`;
}

export const addMoney = (a: MoneyInput, b: MoneyInput): string =>
  fromCents(toCents(a) + toCents(b));
export const subMoney = (a: MoneyInput, b: MoneyInput): string =>
  fromCents(toCents(a) - toCents(b));
export const cmpMoney = (a: MoneyInput, b: MoneyInput): number =>
  Math.sign(toCents(a) - toCents(b));

/** qty (up to 3 decimals) * unit price (money) => money string, exact. */
export function mulQtyPrice(qtyStr: string | number, price: MoneyInput): string {
  const milliQty = toMilliQty(qtyStr);
  const cents = toCents(price);
  return fromCents(roundRatio(BigInt(milliQty) * BigInt(cents), 1000n));
}

export function toMilliQty(value: MoneyInput): number {
  return scaled(value, 3, 999999999999n);
}

export function fromMilliQty(milli: number): string {
  if (!Number.isSafeInteger(milli) || Math.abs(milli) > 999999999999) throw new RangeError("Quantity outside database range");
  const neg = milli < 0;
  const abs = Math.abs(milli);
  const intPart = Math.floor(abs / 1000);
  const frac = String(abs % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${intPart}${frac ? "." + frac : ""}`;
}

export const addQty = (a: string | number, b: string | number): string =>
  fromMilliQty(toMilliQty(a) + toMilliQty(b));
export const subQty = (a: string | number, b: string | number): string =>
  fromMilliQty(toMilliQty(a) - toMilliQty(b));

/** Format money for Arabic UI: ١٢٬٣٤٥ style grouping with Latin digits kept readable. */
export function fmtMoney(value: MoneyInput, currency = "ر.ي"): string {
  const cents = toCents(value);
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = abs % 100;
  const body = frac ? `${intPart}.${String(frac).padStart(2, "0")}` : intPart;
  return `${neg ? "-" : ""}${body} ${currency}`;
}

export function fmtQty(value: string | number | null | undefined): string {
  const milli = toMilliQty(value ?? 0);
  const neg = milli < 0;
  const abs = Math.abs(milli);
  const intPart = Math.floor(abs / 1000).toLocaleString("en-US");
  const frac = String(abs % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${intPart}${frac ? "." + frac : ""}`;
}

/** Validate a user-entered amount: must be a finite, non-negative decimal. */
export function isValidAmount(value: unknown, { allowZero = true } = {}): boolean {
  if (value === null || value === undefined || value === "") return false;
  try { const n = toCents(value as MoneyInput); return allowZero ? n >= 0 : n > 0; } catch { return false; }
}
