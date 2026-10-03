import { describe, expect, it } from 'vitest';
import { buildLedger, mergeSources } from '../src/index';
import { loadFixture } from './fixtures';

describe('opening holdings CSV', () => {
  it('parses rows into OPENING transactions and reproduces the full-history opening quantities', () => {
    const op = loadFixture('opening-holdings-synthetic.csv');
    expect(op.kind).toBe('opening');
    expect(op.stats).toMatchObject({ rows: 6, withCost: 5 });
    expect(op.txns.find((t) => t.symbol === 'PLNT')!.exchangeDate).toBe('2025-03-31');
    expect(op.txns.find((t) => t.symbol === 'TRPL')!.flags).toContain('opening_cost_unknown');
    const hist = mergeSources([loadFixture('alltrades-history-synthetic.xlsx')]);
    const histOpen = buildLedger(hist.txns, { year: 2026, dateBasis: 'exchange' });
    const fromCsv = buildLedger(op.txns, { year: 2026, dateBasis: 'exchange' });
    for (const [k, p] of fromCsv) expect(p.openingQty.toString(), k).toBe(histOpen.get(k)!.openingQty.toString());
  });
});
