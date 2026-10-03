// Calendar-date helpers. Dates are ISO strings 'YYYY-MM-DD'. Time zones use
// Intl (IANA tz database), so DST transitions are handled by the runtime.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  return f;
}

export const TZ_NEW_YORK = 'America/New_York';
export const TZ_AUCKLAND = 'Pacific/Auckland';

/** Local calendar date of a UTC instant in a time zone. */
export function zonedDate(utc: Date, tz: string): string {
  const parts = Object.fromEntries(fmt(tz).formatToParts(utc).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Local time-of-day 'HH:MM:SS' of a UTC instant in a time zone. */
export function zonedTime(utc: Date, tz: string): string {
  const parts = Object.fromEntries(fmt(tz).formatToParts(utc).map((p) => [p.type, p.value]));
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isIsoDate(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

export function addDays(iso: string, n: number): string {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`bad ISO date ${iso}`);
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]! + n));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 'DD/MM/YYYY' -> 'YYYY-MM-DD' (Hatch). */
export function dmyToIso(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/**
 * Sharesies 'Trade date': '2025-01-15 09:12:34.567000 (UTC)' or
 * '2025-01-15 09:12:34 (UTC)'. Returns the UTC instant.
 */
export function parseUtcStamp(s: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?\s*(?:\(UTC\)|UTC|Z)?$/.exec(s.trim());
  if (!m || !isIsoDate(m[1]!)) return null;
  const ms = m[5] ? Math.floor(Number(`0.${m[5]}`) * 1000) : 0;
  const [y, mo, d] = m[1]!.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, +m[2]!, +m[3]!, +m[4]!, ms));
}

/** NZ income year ending 31 March `endYear`: 1 Apr (endYear-1) .. 31 Mar endYear. */
export function incomeYear(endYear: number): { start: string; end: string; label: string } {
  return {
    start: `${endYear - 1}-04-01`,
    end: `${endYear}-03-31`,
    label: `1 April ${endYear - 1} – 31 March ${endYear}`,
  };
}
