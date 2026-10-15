/** Current markets use UTC+03:00 (Yemen/Horn of Africa). Explicit and independent
 * of the server machine timezone; adding other zones requires tenant settings. */
export const BUSINESS_OFFSET_MS = 3 * 60 * 60_000;
export function businessDayStart(daysAgo=0, now=new Date()): Date {
  const local=new Date(now.getTime()+BUSINESS_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-daysAgo)-BUSINESS_OFFSET_MS);
}
export function businessDateBoundary(value: string, end=false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const midnight=new Date(`${value}T00:00:00.000Z`);
  if(Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0,10)!==value) throw new RangeError('Invalid calendar date');
  return new Date(midnight.getTime()-BUSINESS_OFFSET_MS+(end?86400_000-1:0));
}
