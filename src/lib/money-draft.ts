import { toCents, mulQtyPrice, type MoneyInput } from "./money";
/** Draft UI fields can be temporarily invalid. Never use these fallbacks to post. */
export function draftCents(value: MoneyInput): number | null {
  try { const n=toCents(value); return n >= 0 ? n : null; } catch { return null; }
}
export function draftLineTotal(qty: string | number, price: MoneyInput): string | null {
  try { if (Number(qty) <= 0 || draftCents(price) === null) return null; return mulQtyPrice(qty,price); }
  catch { return null; }
}
