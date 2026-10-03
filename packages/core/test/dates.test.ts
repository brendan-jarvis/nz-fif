import { describe, expect, it } from 'vitest';
import { TZ_AUCKLAND, TZ_NEW_YORK, addDays, dmyToIso, incomeYear, isIsoDate, parseUtcStamp, zonedDate } from '../src/dates';

describe('dates', () => {
  it('parses both Sharesies timestamp formats', () => {
    expect(parseUtcStamp('2025-01-15 09:12:34.567000 (UTC)')?.toISOString()).toBe('2025-01-15T09:12:34.567Z');
    expect(parseUtcStamp('2026-03-26 14:05:55 (UTC)')?.toISOString()).toBe('2026-03-26T14:05:55.000Z');
    expect(parseUtcStamp('2026-02-30 10:00:00 (UTC)')).toBeNull();
  });

  it('uses the New York date, not the UTC date, for extended-hours trades', () => {
    const t = parseUtcStamp('2026-01-15 00:20:41 (UTC)')!;
    expect(zonedDate(t, TZ_NEW_YORK)).toBe('2026-01-14');
    expect(zonedDate(t, TZ_AUCKLAND)).toBe('2026-01-15');
  });

  it('pre-market 08:00 UTC falls on the same NZ and NY day', () => {
    const t = parseUtcStamp('2025-05-13 08:00:01.500000 (UTC)')!;
    expect(zonedDate(t, TZ_NEW_YORK)).toBe('2025-05-13');
    expect(zonedDate(t, TZ_AUCKLAND)).toBe('2025-05-13');
  });

  it('handles the 31 Mar / 1 Apr boundary across DST (NZDT ends 6 Apr 2025)', () => {
    const close = parseUtcStamp('2025-03-31 20:00:01 (UTC)')!; // 16:00 EDT / 09:00 NZDT
    expect(zonedDate(close, TZ_NEW_YORK)).toBe('2025-03-31');
    expect(zonedDate(close, TZ_AUCKLAND)).toBe('2025-04-01');
    const afterDst = parseUtcStamp('2025-04-07 13:30:00 (UTC)')!; // NZST (UTC+12) now
    expect(zonedDate(afterDst, TZ_AUCKLAND)).toBe('2025-04-08');
  });

  it('converts Hatch day-first dates and rejects impossible ones', () => {
    expect(dmyToIso('05/04/2025')).toBe('2025-04-05');
    expect(dmyToIso('31/02/2025')).toBeNull();
  });

  it('date arithmetic and income years', () => {
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(isIsoDate('2025-13-01')).toBe(false);
    expect(incomeYear(2026)).toMatchObject({ start: '2025-04-01', end: '2026-03-31' });
  });
});
