/**
 * Exact decimal money arithmetic.
 *
 * PostgreSQL numeric(14,2) values arrive in JS as strings. All arithmetic is
 * performed on integer minor units (1 Rial = 100) so floating point error can
 * never leak into financial records. Quantities use milli-units (1/1000).
 */

export type MoneyInput = string | number | null | undefined;

/** Parse a decimal string/number into integer minor units (cents). */
export function toCents(value: MoneyInput): number {
  if (value === null || value === undefined || value === "") return 0;
  const s = String(value).trim();
  const neg = s.startsWith("-");
  const clean = s.replace(/[^0-9.]/g, "");
  const [intPart, fracPart = ""] = clean.split(".");
  const cents =
    parseInt(intPart || "0", 10) * 100 +
    parseInt((fracPart + "00").slice(0, 2) || "0", 10) +
    (fracPart.length > 2 && parseInt(fracPart[2], 10) >= 5 ? 1 : 0);
  return neg ? -cents : cents;
}

/** Convert integer minor units back to a canonical "1234.50" string. */
export function fromCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
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
  // milliQty * cents / 1000, rounded half-up to nearest cent.
  const product = milliQty * cents;
  const rounded = Math.floor((Math.abs(product) + 500) / 1000) * Math.sign(product || 1);
  return fromCents(product === 0 ? 0 : rounded);
}

/** Parse quantity string into integer milli-units. */
export function toMilliQty(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const s = String(value).trim();
  const neg = s.startsWith("-");
  const clean = s.replace(/[^0-9.]/g, "");
  const [intPart, fracPart = ""] = clean.split(".");
  const milli =
    parseInt(intPart || "0", 10) * 1000 +
    parseInt((fracPart + "000").slice(0, 3) || "0", 10);
  return neg ? -milli : milli;
}

export function fromMilliQty(milli: number): string {
  const neg = milli < 0;
  const abs = Math.abs(Math.round(milli));
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
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  return allowZero ? n >= 0 : n > 0;
}
