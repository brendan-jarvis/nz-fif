// Generates the SYNTHETIC sample exports in fixtures/. Every ticker, quantity,
// price, rate and ID here is invented; the files only copy the *shape* and
// quirks of real Sharesies / Hatch / Sharesight exports (PLAN §0, §9).
// Deterministic: re-running produces identical files.
//   bun scripts/make-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { Decimal } from '../packages/core/src/decimal';
import { TZ_AUCKLAND, TZ_NEW_YORK, addDays, zonedDate } from '../packages/core/src/dates';

type Side = 'BUY' | 'SELL';
interface Trade {
  broker: 'sharesies' | 'hatch' | 'none';
  code: string;
  market: string; // Sharesight market code
  sharesiesMarket?: string; // Sharesies' market code if different (CBOE vs BATS)
  name: string;
  side: Side | 'SPLIT' | 'REINVEST';
  qty: string;
  price: string;
  fee: string;
  /** Sharesies: UTC timestamp. Hatch: NZ date (exchange date = NZ − 1). */
  when: string;
  system?: boolean;
  ccy?: string;
}

const T: Trade[] = [];
const s = (t: Trade) => T.push(t);
const NAMES: Record<string, string> = {
  ACME: 'Acme Robotics Inc', GLOBX: 'Globex Corp', ZETF: 'Zenith Broad Market ETF', ROKT: 'Rocketeer Space Corp',
  PLNT: 'Planetary Data Inc', TRPL: 'Triple Index 3x ETF Trust Shares', MEGA: 'Megacorp Holdings Inc',
};

// --- History before the income year (only in the full-history All Trades) ---
s({ broker: 'none', code: 'ACME', market: 'NASDAQ', name: NAMES.ACME!, side: 'BUY', qty: '10', price: '80.00', fee: '0', when: '2024-03-04' });
s({ broker: 'none', code: 'ROKT', market: 'NASDAQ', name: NAMES.ROKT!, side: 'BUY', qty: '50', price: '12.50', fee: '3', when: '2024-06-10' });
s({ broker: 'none', code: 'PLNT', market: 'NASDAQ', name: NAMES.PLNT!, side: 'BUY', qty: '6', price: '25.00', fee: '0', when: '2024-08-01' });
s({ broker: 'none', code: 'TRPL', market: 'NASDAQ', name: NAMES.TRPL!, side: 'BUY', qty: '0.4', price: '60.00', fee: '0', when: '2024-09-02' });
s({ broker: 'none', code: 'MEGA', market: 'NASDAQ', name: NAMES.MEGA!, side: 'BUY', qty: '20', price: '150.00', fee: '3', when: '2024-11-11' });
s({ broker: 'none', code: 'BTC', market: 'CRYPTO', name: 'Bitcoin', side: 'BUY', qty: '0.0105', price: '1', fee: '0', when: '2024-05-05', ccy: 'BTC' });

// --- Sharesies (UTC timestamps, mixed formats) ---
// Boundary: NY 31 Mar 2025 16:00 EDT = NZ 1 Apr 2025 09:00 NZDT (exchange basis: prior year; NZ basis: this year)
s({ broker: 'sharesies', code: 'ACME', market: 'NASDAQ', name: NAMES.ACME!, side: 'BUY', qty: '0.25000000', price: '90.000', fee: '0.00000', when: '2025-03-31 20:00:01.120000 (UTC)' });
s({ broker: 'sharesies', code: 'ACME', market: 'NASDAQ', name: NAMES.ACME!, side: 'BUY', qty: '0.51234567', price: '92.400', fee: '0.23660', when: '2025-04-09 13:41:12.250000 (UTC)' });
// Two same-day buys with EQUAL quantities at different prices (merge must pair by price)
s({ broker: 'sharesies', code: 'ACME', market: 'NASDAQ', name: NAMES.ACME!, side: 'BUY', qty: '0.50000000', price: '100.000', fee: '0.00000', when: '2025-06-02 13:31:00.000000 (UTC)' });
s({ broker: 'sharesies', code: 'ACME', market: 'NASDAQ', name: NAMES.ACME!, side: 'BUY', qty: '0.50000000', price: '100.500', fee: '0.00000', when: '2025-06-02 15:02:10.500000 (UTC)' });
// System-initiated (probable DRP) on a dividend date
s({ broker: 'sharesies', code: 'ACME', market: 'NASDAQ', name: NAMES.ACME!, side: 'BUY', qty: '0.00321000', price: '101.200', fee: '0.00000', when: '2025-09-15 13:44:09.610000 (UTC)', system: true });
s({ broker: 'sharesies', code: 'GLOBX', market: 'NYSE', name: NAMES.GLOBX!, side: 'BUY', qty: '1.20000000', price: '45.150', fee: '0.27090', when: '2025-04-22 13:45:00.250000 (UTC)' });
// Extended-hours: 00:20 UTC on 15 Jan = 14 Jan in New York (UTC date would be wrong)
s({ broker: 'sharesies', code: 'GLOBX', market: 'NYSE', name: NAMES.GLOBX!, side: 'BUY', qty: '0.75000000', price: '52.800', fee: '0.19800', when: '2026-01-15 00:20:41.000000 (UTC)' });
s({ broker: 'sharesies', code: 'ZETF', market: 'BATS', sharesiesMarket: 'CBOE', name: NAMES.ZETF!, side: 'BUY', qty: '2.40000000', price: '31.250', fee: '0.00000', when: '2025-04-28 14:10:03.300000 (UTC)' });
s({ broker: 'sharesies', code: 'ZETF', market: 'BATS', sharesiesMarket: 'CBOE', name: NAMES.ZETF!, side: 'BUY', qty: '3.00000000', price: '33.100', fee: '0.00000', when: '2026-03-26 14:05:55 (UTC)' });
// ROKT: small buy, then a pre-market sell (08:00 UTC: NZ date = NY date)
s({ broker: 'sharesies', code: 'ROKT', market: 'NASDAQ', name: NAMES.ROKT!, side: 'BUY', qty: '0.30000000', price: '20.000', fee: '0.00000', when: '2025-05-01 13:35:00.000000 (UTC)' });
s({ broker: 'sharesies', code: 'ROKT', market: 'NASDAQ', name: NAMES.ROKT!, side: 'SELL', qty: '1.00000000', price: '24.400', fee: '0.40000', when: '2025-05-13 08:00:01.500000 (UTC)' });
s({ broker: 'sharesies', code: 'ROKT', market: 'NASDAQ', name: NAMES.ROKT!, side: 'BUY', qty: '2.00000000', price: '30.000', fee: '0.50000', when: '2025-09-10 13:40:00.000000 (UTC)' });
// PLNT: buy 0.25, then sell 6 + 0.2 the same day
s({ broker: 'sharesies', code: 'PLNT', market: 'NASDAQ', name: NAMES.PLNT!, side: 'BUY', qty: '0.25000000', price: '100.000', fee: '0.00000', when: '2025-04-15 13:31:00.000000 (UTC)' });
s({ broker: 'sharesies', code: 'PLNT', market: 'NASDAQ', name: NAMES.PLNT!, side: 'SELL', qty: '6', price: '118.400', fee: '4.50000', when: '2025-05-13 08:00:03.100000 (UTC)' });
s({ broker: 'sharesies', code: 'PLNT', market: 'NASDAQ', name: NAMES.PLNT!, side: 'SELL', qty: '0.20000000', price: '118.400', fee: '0.00000', when: '2025-05-13 08:00:03.400000 (UTC)' });
s({ broker: 'sharesies', code: 'PLNT', market: 'NASDAQ', name: NAMES.PLNT!, side: 'BUY', qty: '3.00000000', price: '130.000', fee: '0.50000', when: '2025-10-01 13:31:00.000000 (UTC)' });
// TRPL: clean round trip 14 May -> 1 Jul, then a 2:1 split on 24 Nov (All Trades only)
s({ broker: 'sharesies', code: 'TRPL', market: 'NASDAQ', name: NAMES.TRPL!, side: 'BUY', qty: '0.04000000', price: '70.200', fee: '0.00000', when: '2025-05-14 13:31:00.000000 (UTC)' });
s({ broker: 'sharesies', code: 'TRPL', market: 'NASDAQ', name: NAMES.TRPL!, side: 'SELL', qty: '0.04000000', price: '84.600', fee: '0.04000', when: '2025-07-01 08:00:02.200000 (UTC)' });
s({ broker: 'none', code: 'TRPL', market: 'NASDAQ', name: NAMES.TRPL!, side: 'SPLIT', qty: '0.4', price: '', fee: '', when: '2025-11-24' });
// Boundary at year end: NY 31 Mar 2026 10:30 EDT = NZ 1 Apr 2026 03:30 NZDT
s({ broker: 'sharesies', code: 'ACME', market: 'NASDAQ', name: NAMES.ACME!, side: 'BUY', qty: '0.10000000', price: '110.000', fee: '0.00000', when: '2026-03-31 14:30:00.000000 (UTC)' });

// --- Hatch (NZ dates, fee inside Amount) ---
s({ broker: 'hatch', code: 'MEGA', market: 'NASDAQ', name: NAMES.MEGA!, side: 'BUY', qty: '25.0', price: '182.40', fee: '3.00', when: '2025-04-06' });
s({ broker: 'hatch', code: 'MEGA', market: 'NASDAQ', name: NAMES.MEGA!, side: 'BUY', qty: '10.0', price: '176.10', fee: '3.00', when: '2025-04-09' });
s({ broker: 'hatch', code: 'GLOBX', market: 'NYSE', name: NAMES.GLOBX!, side: 'BUY', qty: '4.5', price: '48.66', fee: '3.00', when: '2025-08-19' });
s({ broker: 'hatch', code: 'ROKT', market: 'NASDAQ', name: NAMES.ROKT!, side: 'SELL', qty: '40.0', price: '38.25', fee: '4.00', when: '2025-07-24' });

// --- All Trades only: crypto, a staking reinvestment, a zero-value token write-off ---
s({ broker: 'none', code: 'BTC', market: 'CRYPTO', name: 'Bitcoin', side: 'BUY', qty: '0.00052000', price: '1', fee: '0', when: '2026-02-10', ccy: 'BTC' });
s({ broker: 'none', code: 'ETH', market: 'CRYPTO', name: 'Ethereum', side: 'BUY', qty: '0.08000000', price: '1', fee: '0', when: '2025-10-07', ccy: 'ETH' });
s({ broker: 'none', code: 'ATOM', market: 'CRYPTO', name: 'Cosmos', side: 'REINVEST', qty: '2.5', price: '1', fee: '0', when: '2025-10-06', ccy: 'ATOM' });
s({ broker: 'none', code: 'FAKETKN', market: 'OTHER', name: 'Fake Token', side: 'SELL', qty: '1500', price: '0', fee: '0', when: '2025-10-08', ccy: 'NZD' });

// Hatch amounts that disagree with qty x price ± fee (real-export quirk)
const HATCH_AMOUNT_OVERRIDE: Record<string, string> = { 'MEGA|2025-04-06': '-4563.05', 'ROKT|2025-07-24': '1526.15' };

// Invented Sharesight per-trade rates (USD per NZD), never equal to RBNZ.
function rateFor(date: string, i: number): Decimal {
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return new Decimal((0.5853 + 0.0151 * Math.sin(day / 37) + 0.00031 * (i % 3)).toFixed(6));
}

function exchangeDateOf(t: Trade): string {
  if (t.broker === 'sharesies') {
    const iso = t.when.replace(' (UTC)', '').replace(' ', 'T') + 'Z';
    return zonedDate(new Date(iso), TZ_NEW_YORK);
  }
  if (t.broker === 'hatch') return addDays(t.when, -1);
  return t.when;
}

// ---------- All Trades rows ----------
const HEADER = ['Code', 'Market Code', 'Name', 'Date', 'Type', 'Qty', 'Price', 'Instrument Currency', 'Cost Base Per Share (nzd)', 'Brokerage', 'Brokerage Currency', 'Exch. Rate', 'Value', ' '];
type Row = (string | number | null)[];
const atRows: { date: string; market: string; row: Row }[] = [];
T.forEach((t, i) => {
  const date = exchangeDateOf(t);
  const ccy = t.ccy ?? 'USD';
  if (t.side === 'SPLIT') {
    atRows.push({ date, market: t.market, row: [t.code, t.market, t.name, date, 'Split', Number(t.qty), null, ccy, null, null, 'NZD', null, null, null] });
    return;
  }
  const qty = new Decimal(t.qty);
  const price = new Decimal(t.price || '0');
  const fee = new Decimal(t.fee || '0');
  const sell = t.side === 'SELL';
  const crypto = t.market === 'CRYPTO';
  const rate = t.market === 'OTHER' ? new Decimal(1) : crypto ? new Decimal('0.0000081').times(1 + (i % 5) / 10) : rateFor(date, i);
  const gross = qty.times(price);
  const value = crypto ? qty.div(rate) : (sell ? gross.minus(fee).neg() : gross.plus(fee)).div(rate);
  const type = t.side === 'REINVEST' ? 'Reinvestment' : sell ? 'Sell' : 'Buy';
  atRows.push({
    date, market: t.market,
    row: [t.code, t.market, t.name, date, type, Number(sell ? qty.neg() : qty), Number(price), ccy, null, Number(fee), ccy, Number(rate.toFixed(crypto ? 12 : 6)), Number(value.toFixed(2)), null],
  });
});
atRows.sort((a, b) => (a.row[0]! < b.row[0]! ? -1 : a.row[0]! > b.row[0]! ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
// Make the equal-quantity ACME pair appear in the opposite order to the CSV.
const eq = atRows.filter((r) => r.row[0] === 'ACME' && r.date === '2025-06-02');
if (eq.length === 2) { const [a, b] = [atRows.indexOf(eq[0]!), atRows.indexOf(eq[1]!)]; [atRows[a], atRows[b]] = [atRows[b]!, atRows[a]!]; }

function allTradesWorkbook(rows: typeof atRows, title: string): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: title, CreatedDate: new Date('2026-04-02T00:00:00Z'), ModifiedDate: new Date('2026-04-02T00:00:00Z') };
  const total: Row = ['Total', null, null, null, null, null, null, null, null, null, null, null, null, null];
  const combined = [[title, ...Array(13).fill(null)], Array(14).fill(null), HEADER, ...rows.map((r) => r.row), total];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combined), 'Combined');
  const markets = [...new Set(rows.map((r) => r.market))].sort();
  markets.forEach((m, i) => {
    const g = `Grouping ${i + 1} ${m}`;
    const sheet = [[title, ...Array(13).fill(null)], [g, ...Array(13).fill(null)], Array(14).fill(null), HEADER, ...rows.filter((r) => r.market === m).map((r) => r.row), total];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), g);
  });
  return wb;
}

mkdirSync('fixtures', { recursive: true });
const writeXlsx = (wb: XLSX.WorkBook, path: string) =>
  writeFileSync(path, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer);
const fy = atRows.filter((r) => r.date >= '2025-04-01' && r.date <= '2026-03-31');
writeXlsx(allTradesWorkbook(fy, 'All trades report for: Synthetic Portfolio'), 'fixtures/alltrades-fy2026-synthetic.xlsx');
writeXlsx(allTradesWorkbook(atRows, 'All Trades Report for Synthetic Portfolio'), 'fixtures/alltrades-history-synthetic.xlsx');

// ---------- Sharesies CSV ----------
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const shLines = [['Trade ID', 'Trade date', 'Instrument code', 'Instrument name', 'Market code', 'Quantity', 'Price', 'Transaction type', 'Currency', 'Amount', 'Transaction fee', 'Transaction method', 'Portfolio', 'Initiated by'].join(',')];
T.filter((t) => t.broker === 'sharesies').forEach((t, i) => {
  const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
  const amount = new Decimal(t.qty).times(t.price);
  shLines.push([id, t.when, t.code, t.name, t.sharesiesMarket ?? t.market, t.qty, t.price, t.side, 'usd', amount.toFixed(), t.fee, t.side, 'Growth', t.system ? 'System' : 'Investor'].map(csvCell).join(','));
});
writeFileSync('fixtures/sharesies-synthetic.csv', shLines.join('\n') + '\n');

// ---------- Hatch CSV (newest first, like the real export) ----------
const hLines: { date: string; line: string }[] = [];
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const hRow = (date: string, cells: string[]) => hLines.push({ date, line: [dmy(date), ...cells].map(csvCell).join(',') });
for (const t of T.filter((x) => x.broker === 'hatch')) {
  const qty = new Decimal(t.qty);
  const gross = qty.times(t.price);
  const fee = new Decimal(t.fee);
  const sell = t.side === 'SELL';
  const amt = HATCH_AMOUNT_OVERRIDE[`${t.code}|${t.when}`] ?? (sell ? gross.minus(fee) : gross.plus(fee).neg()).toFixed(2);
  const kind = sell ? 'Market' : 'Limit';
  const desc = `${kind} order for ${t.qty} shares @ $${t.price} ${sell ? '-' : '+'} $${fee.toFixed(2)} fee`;
  hRow(t.when, [`Order - ${sell ? 'Sell' : 'Buy'}`, t.code, t.name, desc, amt, t.price, t.qty, `-${fee.toFixed(2)}`]);
}
hRow('2025-04-04', ['Cancelled order - Buy', 'MEGA', NAMES.MEGA!, 'Limit order for 10.0 shares @ $170.00', '0.00', '', '', '']);
hRow('2026-01-18', ['Cancelled order - Buy', 'GLOBX', NAMES.GLOBX!, 'Market order for $1,500.00', '0.00', '', '', '']);
hRow('2025-04-04', ['Deposit', '', '', '', '7000.00', '', '', '']);
hRow('2025-06-27', ['Dividend', 'MEGA', NAMES.MEGA!, 'MEGA dividend, $0.50 a share', '23.38', '', '', '']);
hRow('2025-12-24', ['Dividend', 'MEGA', NAMES.MEGA!, 'MEGA dividend, $0.50 a share', '23.38', '', '', '']);
hRow('2025-09-15', ['Dividend', 'GLOBX', NAMES.GLOBX!, 'GLOBX dividend, $0.21 a share', '0.77', '', '', '']);
hRow('2025-04-02', ['Dividend', 'DAGXX', '', 'Money market fund', '121.07', '', '', '']);
hRow('2025-05-02', ['Dividend', 'DAGXX', '', 'Money market fund', '38.62', '', '', '']);
hRow('2026-01-05', ['Dividend', 'DAGXX', '', 'Money market fund', '9.80', '', '', '']);
hRow('2026-02-03', ['Dividend', '', '', 'January 2026 Dividend', '4.10', '', '', '']);
hRow('2026-02-03', ['Interest Adjustment', '', '', 'January 2026 Interest', '2.05', '', '', '']);
hRow('2026-02-05', ['Interest Adjustment', '', '', 'Reversal of January 2026 CD Interest', '-2.05', '', '', '']);
hLines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
writeFileSync('fixtures/hatch-synthetic.csv', ['Date,Transaction type,Symbol,Investment name,Description,Amount (USD),Order fill price,Order share quantity,Order fee', ...hLines.map((h) => h.line)].join('\n') + '\n');

console.log(`fixtures: sharesies ${shLines.length - 1} trades, hatch ${hLines.length} rows, alltrades FY ${fy.length} / history ${atRows.length} rows`);
// NZ dates used for documentation in fixtures/README.md
void TZ_AUCKLAND;
