import { describe, expect, it } from 'vitest';
import { calculate, allTables, tableToCsv, resultToJson, REPORT_DISCLAIMER, Decimal } from '../src/index';
import { fif, fixedFx, nzdPrice, tx } from './engine-helpers';

describe('report', () => {
  const txns = [
    tx({ type: 'OPENING', date: '2024-06-01', qty: '10000', amount: '150000' }),
    tx({ type: 'BUY', date: '2025-10-01', qty: '5000', amount: '110000' }),
    tx({ type: 'SELL', date: '2025-12-01', qty: '-4000', amount: '100000' }),
    tx({ type: 'BUY', date: '2025-12-23', qty: '2000', amount: '44000' }),
  ];
  const r = calculate({ txns, year: 2026, classes: fif('COA'), prices: { 'COA:US': { opening: nzdPrice('20'), closing: nzdPrice(new Decimal(254000).div(13000).toString()) } }, fx: fixedFx() });
  const tables = allTables(r, [{ key: 'COA:US', fifClass: 'fif', source: 'rule', rule: 'foreign_listed', reason: 'r', yahooSymbol: 'COA' }], []);
  it('builds the Sharesight-shaped sections and IR3 boxes', () => {
    expect(tables.map((t) => t.id)).toEqual(['summary', 'threshold', 'fdr', 'quick-sale', 'cv', 'tax', 'assumptions', 'ir3']);
    const summary = tables[0]!;
    expect(summary.rows.find((x) => x[0] === 'FDR' && x[1] === 'Foreign Investment Fund Income')![2]).toBe('12200.00');
    const ir3 = tables.find((t) => t.id === 'ir3')!;
    expect(ir3.title).toContain('CV'); // CV 0 < FDR 12,200
    expect(ir3.rows[0]![1]).toBe('0.00');
  });
  it('writes CSV safely (quotes, formula injection) and full-precision JSON with the disclaimer', () => {
    const csv = tableToCsv({ id: 'x', title: 'x', columns: ['a', 'b'], rows: [['=HYPERLINK("x")', 'has,comma'], ['-12.50', '@SUM']] });
    expect(csv).toBe('a,b\r\n"\'=HYPERLINK(""x"")","has,comma"\r\n-12.50,\'@SUM\r\n');
    const j = JSON.parse(resultToJson(r));
    expect(j.disclaimer).toBe(REPORT_DISCLAIMER);
    expect(j.result.totals.fdr).toBe('12200');
  });
});
