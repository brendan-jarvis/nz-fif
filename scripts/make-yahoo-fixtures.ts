// Deterministic SYNTHETIC Yahoo chart responses for Worker and Playwright tests.
// Same shape as real `v8/finance/chart` JSON (meta / timestamp / events / indicators),
// with invented prices. Tests never call Yahoo.
import { mkdirSync, writeFileSync } from 'node:fs';

interface Case {
  symbol: string; tz: string; currency: string; exchangeName: string;
  /** UTC hour of the daily bar timestamp (market open), may fall on the previous UTC day. */
  utcHour: number; utcDayShift: number;
  from: string; to: string; holidays?: string[]; base: number;
  splits?: Array<{ date: string; num: number; den: number }>;
}

const CASES: Case[] = [
  { symbol: 'TRPL', tz: 'America/New_York', currency: 'USD', exchangeName: 'NGM', utcHour: 13, utcDayShift: 0, from: '2025-03-19', to: '2025-04-02', base: 31.5, splits: [{ date: '2025-11-24', num: 2, den: 1 }] },
  { symbol: 'ACME', tz: 'America/New_York', currency: 'USD', exchangeName: 'NMS', utcHour: 13, utcDayShift: 0, from: '2025-04-08', to: '2025-04-21', holidays: ['2025-04-18'], base: 101.25 },
  { symbol: 'BRK-B', tz: 'America/New_York', currency: 'USD', exchangeName: 'NYQ', utcHour: 13, utcDayShift: 0, from: '2026-03-20', to: '2026-04-02', base: 404.4 },
  { symbol: 'CSL.AX', tz: 'Australia/Sydney', currency: 'AUD', exchangeName: 'ASX', utcHour: 23, utcDayShift: -1, from: '2025-03-20', to: '2025-04-02', base: 250.1 },
  { symbol: 'FPH.NZ', tz: 'Pacific/Auckland', currency: 'NZD', exchangeName: 'NZE', utcHour: 21, utcDayShift: -1, from: '2025-03-20', to: '2025-04-02', base: 35.55 },
  { symbol: 'VOD.L', tz: 'Europe/London', currency: 'GBp', exchangeName: 'LSE', utcHour: 8, utcDayShift: 0, from: '2026-03-20', to: '2026-04-02', base: 71.3 },
];

function days(from: string, to: string, holidays: string[] = []): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.includes(iso)) out.push(iso);
  }
  return out;
}
const ts = (iso: string, c: Pick<Case, 'utcHour' | 'utcDayShift'>) => Date.parse(`${iso}T00:00:00Z`) / 1000 + c.utcDayShift * 86400 + c.utcHour * 3600;

function meta(c: Case) {
  return {
    currency: c.currency, symbol: c.symbol, exchangeName: c.exchangeName, fullExchangeName: c.exchangeName, instrumentType: 'EQUITY',
    firstTradeDate: 946857600, regularMarketTime: 1790000000, hasPrePostMarketData: false, gmtoffset: 0, timezone: 'UTC',
    exchangeTimezoneName: c.tz, regularMarketPrice: c.base, priceHint: 2, dataGranularity: '1d', range: '',
  };
}

mkdirSync('fixtures/yahoo', { recursive: true });
for (const c of CASES) {
  const ds = days(c.from, c.to, c.holidays);
  const close = ds.map((_, i) => Math.round((c.base + ((i * 37) % 11) * 0.35 - 1.2) * 1e4) / 1e4);
  const bars = {
    chart: {
      result: [{
        meta: meta(c), timestamp: ds.map((d) => ts(d, c)),
        indicators: { quote: [{ open: close, high: close, low: close, close, volume: ds.map((_, i) => 1000 + i) }], adjclose: [{ adjclose: close }] },
      }],
      error: null,
    },
  };
  const splitEvents = Object.fromEntries((c.splits ?? []).map((s) => {
    const t = ts(s.date, c);
    return [String(t), { date: t, numerator: s.num, denominator: s.den, splitRatio: `${s.num}:${s.den}` }];
  }));
  const coarse = {
    chart: {
      result: [{
        meta: { ...meta(c), dataGranularity: '3mo' }, timestamp: [ts(c.from, c)],
        ...(c.splits ? { events: { splits: splitEvents } } : {}),
        indicators: { quote: [{ close: [c.base] }] },
      }],
      error: null,
    },
  };
  writeFileSync(`fixtures/yahoo/${c.symbol}.bars.json`, JSON.stringify(bars, null, 1) + '\n');
  writeFileSync(`fixtures/yahoo/${c.symbol}.splits.json`, JSON.stringify(coarse, null, 1) + '\n');
}
writeFileSync('fixtures/yahoo/NOPE.notfound.json', JSON.stringify({ chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } }, null, 1) + '\n');
console.log('wrote', CASES.length * 2 + 1, 'files');
