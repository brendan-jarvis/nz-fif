// Build the bundled RBNZ B1 daily exchange-rate snapshot.
// Usage: tsx scripts/build-rbnz.ts <hb1-daily.xlsx downloaded from rbnz.govt.nz>
// Output: packages/core/data/rbnz-b1-daily.json (foreign units per 1 NZD).
// RBNZ: "You are free to copy, distribute and adapt these statistics subject to
// the conditions listed on our copyright page." Attribution is in NOTICE.
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';
import { excelSerialToIso } from '../packages/core/src/parsers/common';

const KEEP = ['USD', 'GBP', 'AUD', 'JPY', 'EUR', 'CAD', 'HKD', 'SGD'];
const src = process.argv[2];
if (!src) throw new Error('usage: build-rbnz.ts <hb1-daily.xlsx>');
const wb = XLSX.read(readFileSync(src));
const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Data']!, { header: 1, raw: true });
const unitRow = rows.find((r) => r[0] === 'Unit')!;
const idRow = rows.find((r) => r[0] === 'Series Id')!;
const cols: Record<string, number> = {};
const seriesIds: Record<string, string> = {};
unitRow.forEach((u, i) => {
  const m = /^NZD\/([A-Z]{3})$/.exec(String(u ?? ''));
  if (m && KEEP.includes(m[1]!)) { cols[m[1]!] = i; seriesIds[m[1]!] = String(idRow[i]); }
});
const dates: string[] = [];
const rates: Record<string, Array<number | null>> = Object.fromEntries(KEEP.map((c) => [c, []]));
for (const r of rows) {
  if (typeof r[0] !== 'number') continue;
  dates.push(excelSerialToIso(r[0]));
  for (const c of KEEP) {
    const v = r[cols[c]!];
    rates[c]!.push(typeof v === 'number' ? Number(v.toPrecision(10)) : null);
  }
}
const desc = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Table Description']!, { header: 1, raw: true });
const pub = desc.find((r) => r[0] === 'Published Date')?.[1];
const out = {
  source: 'Reserve Bank of New Zealand, B1 Daily exchange rates (hb1-daily.xlsx)',
  url: 'https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index',
  licence: 'Free to copy, distribute and adapt subject to the conditions on the RBNZ copyright page',
  quote: 'foreign currency units per 1 NZD',
  published: typeof pub === 'number' ? excelSerialToIso(pub) : String(pub ?? ''),
  seriesIds,
  dates,
  rates,
};
writeFileSync('packages/core/data/rbnz-b1-daily.json', JSON.stringify(out) + '\n');
console.log(`wrote ${dates.length} days ${dates[0]}..${dates[dates.length - 1]}`);
