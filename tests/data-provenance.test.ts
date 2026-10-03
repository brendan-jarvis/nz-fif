// The bundled RBNZ snapshot is exempt from the data-guard denylist (its public
// exchange rates can coincide with rates in a broker export). This test pins its
// exact shape so it can only ever contain dates and exchange rates.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const j = JSON.parse(readFileSync('packages/core/data/rbnz-b1-daily.json', 'utf8')) as Record<string, unknown>;

describe('packages/core/data/rbnz-b1-daily.json', () => {
  it('has only the expected keys and metadata', () => {
    expect(Object.keys(j).sort()).toEqual(['dates', 'licence', 'published', 'quote', 'rates', 'seriesIds', 'source', 'url']);
    expect(j.source).toMatch(/^Reserve Bank of New Zealand/);
    expect(j.url).toBe('https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index');
    expect(j.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('dates are strictly increasing ISO dates and every series is numbers or null in a plausible range', () => {
    const dates = j.dates as string[];
    expect(dates.length).toBeGreaterThan(1000);
    for (let i = 0; i < dates.length; i++) {
      expect(dates[i]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (i) expect(dates[i]! > dates[i - 1]!).toBe(true);
    }
    const ranges: Record<string, [number, number]> = { USD: [0.4, 1], GBP: [0.3, 0.7], AUD: [0.8, 1.1], JPY: [55, 110], EUR: [0.4, 0.8], CAD: [0.7, 1.1], HKD: [3, 7], SGD: [0.6, 1.2] };
    const rates = j.rates as Record<string, Array<number | null>>;
    expect(Object.keys(rates).sort()).toEqual(Object.keys(ranges).sort());
    expect(Object.keys(j.seriesIds as object).sort()).toEqual(Object.keys(ranges).sort());
    for (const [c, arr] of Object.entries(rates)) {
      expect(arr.length).toBe(dates.length);
      for (const v of arr) if (v !== null) { expect(v).toBeGreaterThanOrEqual(ranges[c]![0]); expect(v).toBeLessThanOrEqual(ranges[c]![1]); }
    }
  });
});
