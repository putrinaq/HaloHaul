import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const TZ = "Asia/Kuala_Lumpur";

/** Formats in Malaysia time regardless of the server's or browser's zone. */
export function fmtDate(d: Date | string, pattern = "do MMMM yyyy"): string {
  return format(new TZDate(new Date(d).getTime(), TZ), pattern);
}

export const fmtDateShort = (d: Date | string) => fmtDate(d, "d MMM yyyy");
export const fmtDateTime = (d: Date | string) => fmtDate(d, "d MMM yyyy, h:mm a");

export { formatCny, formatMyr } from "@/domain/money";

export function fmtDays(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return null;
  return min === max ? `~${min} days` : `${min}–${max} days`;
}

export function orderNo(id: number): string {
  return `#${id}`;
}
