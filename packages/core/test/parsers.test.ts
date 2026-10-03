import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/decimal';
import { csvRows, detectKind, parseAllTrades, xlsxSheets } from '../src/index';
import { pickAllTradesSheet } from '../src/parsers/alltrades';
import { loadFixture } from './fixtures';
import { readFileSync } from 'node:fs';

describe('Sharesies parser (synthetic fixture)', () => {
  const r = loadFixture('sharesies-synthetic.csv');
  it('detects and counts trades', () => {
    expect(r.kind).toBe('sharesies');
    expect(r.txns).toHaveLength(19);
    expect(r.stats).toMatchObject({ buy: 15, sell: 4, drpLikely: 1, amountMismatch: 0 });
    expect(r.warnings).toEqual([]);
  });
  it('maps System rows to DRP (flagged) and signs sells negative', () => {
    const drp = r.txns.find((t) => t.type === 'DRP')!;
    expect(drp.flags).toContain('drp_inferred_from_initiated_by_system');
    const sell = r.txns.find((t) => t.symbol === 'ROKT' && t.type === 'SELL')!;
    expect(sell.qty).toBe('-1');
    expect(sell.cashAmount).toBe(new Decimal('24.4').minus('0.4').toFixed());
  });
  it('puts the fee outside Amount: buy cash = −(qty × price + fee)', () => {
    const t = r.txns.find((x) => x.symbol === 'ACME' && x.exchangeDate === '2025-04-09')!;
    expect(t.cashAmount).toBe(new Decimal('0.51234567').times('92.4').plus('0.2366').neg().toFixed());
  });
  it('aliases CBOE to BATS and pools US venues in the instrument key', () => {
    const z = r.txns.find((t) => t.symbol === 'ZETF')!;
    expect(z.exchange).toBe('BATS');
    expect(z.instrumentKey).toBe('ZETF:US');
    expect(z.assetClass).toBe('etf');
  });
  it('keeps quantities exact (8 dp, never rounded)', () => {
    expect(r.txns.some((t) => t.qty === '0.51234567')).toBe(true);
  });
  it('derives NY exchange dates and NZ dates', () => {
    const ext = r.txns.find((t) => t.symbol === 'GLOBX' && t.tsUtc?.startsWith('2026-01-15'))!;
    expect(ext.exchangeDate).toBe('2026-01-14');
    expect(ext.nzDate).toBe('2026-01-15');
  });
});

describe('Hatch parser (synthetic fixture)', () => {
  const r = loadFixture('hatch-synthetic.csv');
  it('counts orders, drops cancelled, keeps dividends and cash rows', () => {
    expect(r.kind).toBe('hatch');
    expect(r.stats).toMatchObject({ rows: 16, buy: 3, sell: 1, orders: 4, cancelled: 2, dividend: 7, interest: 2, deposit: 1, amountMismatch: 2 });
  });
  it('keeps qty × price ± fee and flags Amount differences', () => {
    const t = r.txns.find((x) => x.symbol === 'MEGA' && x.nzDate === '2025-04-06')!;
    expect(t.cashAmount).toBe('-4563');
    expect(t.flags.some((f) => f.startsWith('hatch_amount_differs:-4563.05'))).toBe(true);
  });
  it('infers the US date as NZ date − 1', () => {
    const t = r.txns.find((x) => x.symbol === 'ROKT')!;
    expect(t.nzDate).toBe('2025-07-24');
    expect(t.exchangeDate).toBe('2025-07-23');
    expect(t.qty).toBe('-40');
  });
  it('grosses up net dividends at 15 % (flagged) but not money-market dividends', () => {
    const d = r.txns.find((x) => x.type === 'DIVIDEND' && x.symbol === 'MEGA')!;
    expect(new Decimal(d.dividend!.gross).toFixed(6)).toBe(new Decimal('23.38').div('0.85').toFixed(6));
    expect(new Decimal(d.dividend!.wht).plus(d.dividend!.net).toFixed(10)).toBe(new Decimal(d.dividend!.gross).toFixed(10));
    expect(d.flags.some((f) => f.startsWith('hatch_net_dividend_grossed_up_15pct'))).toBe(true);
    const mmf = r.txns.filter((x) => x.assetClass === 'cash_mmf' && x.type === 'DIVIDEND');
    expect(mmf).toHaveLength(3);
    expect(mmf.every((x) => x.symbol === 'DAGXX' && x.dividend!.wht === '0')).toBe(true);
    const unassigned = r.txns.find((x) => x.instrumentKey === 'UNASSIGNED:HATCH')!;
    expect(unassigned.flags).toContain('unassigned_dividend_no_symbol');
  });
});

describe('All Trades parser (synthetic fixtures)', () => {
  it('reads the Combined sheet, skips title rows and the Total row', () => {
    const r = loadFixture('alltrades-fy2026-synthetic.xlsx');
    expect(r.kind).toBe('alltrades');
    expect(r.txns).toHaveLength(27);
    expect(r.stats).toMatchObject({ totalRows: 1, crypto: 3, other: 1, type_SPLIT: 1, type_DRP: 1 });
    const t = r.txns.find((x) => x.symbol === 'ZETF')!;
    expect(t.exchange).toBe('BATS');
    expect(t.fxSource).toBe('sharesight_trade');
    expect(t.fxForeignPerNzd).toBeDefined();
    expect(t.nzdValue).toBeDefined();
  });
  it('finds the header on market sheets too (row 4)', () => {
    const sheets = xlsxSheets(readFileSync('fixtures/alltrades-fy2026-synthetic.xlsx'));
    const market = [...sheets.entries()].find(([n]) => n.endsWith('NYSE'))!;
    const r = parseAllTrades(market[1], 'nyse');
    expect(r.txns.every((t) => t.exchange === 'NYSE')).toBe(true);
    expect(pickAllTradesSheet(sheets)?.name).toBe('Combined');
  });
  it('reads the CSV variant', () => {
    const csv = 'Code,Market Code,Name,Date,Type,Qty,Price,Instrument Currency,Cost Base Per Share (nzd),Brokerage,Brokerage Currency,Exch. Rate,Value,\nACME,NASDAQ,Acme,2025-05-01,Buy,1.5,10,USD,,1,USD,0.6,26.67,\nTotal,,,,,,,,,,,,,\n';
    const rows = csvRows(csv);
    expect(detectKind(rows)).toBe('alltrades');
    const r = parseAllTrades(rows, 'x.csv');
    expect(r.txns).toHaveLength(1);
    expect(r.txns[0]!.cashAmount).toBe('-16');
    expect(r.txns[0]!.nzDate).toBe('2025-05-02');
  });
  it('rejects unknown files gracefully', () => {
    expect(detectKind(csvRows('a,b\n1,2\n'))).toBe('unknown');
  });
});
