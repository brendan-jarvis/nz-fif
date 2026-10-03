import { describe, expect, it } from 'vitest';
import { mergeSources } from '../src/merge';
import { loadFixture } from './fixtures';

const sh = loadFixture('sharesies-synthetic.csv');
const ha = loadFixture('hatch-synthetic.csv');
const fy = loadFixture('alltrades-fy2026-synthetic.xlsx');
const hist = loadFixture('alltrades-history-synthetic.xlsx');

describe('merge (synthetic)', () => {
  it('matches broker trades one-to-one with All Trades rows (FY export)', () => {
    const m = mergeSources([sh, ha, fy]);
    expect(m.recon.matchedBySource).toEqual({ sharesies: 18, hatch: 4 });
    // The 31 Mar 2025 (New York) trade is outside the FY All Trades export.
    expect(m.recon.csvOnly.map((r) => r.exchangeDate)).toEqual(['2025-03-31']);
    expect(m.recon.allTradesOnly).toHaveLength(5);
    expect(m.recon.allTradesOnlyByClass).toEqual({ crypto: 3, other: 1, etf: 1 });
    expect(m.recon.allTradesOnlyByType).toMatchObject({ SPLIT: 1, DRP: 1 });
  });

  it('matches everything against the full-history export', () => {
    const m = mergeSources([sh, ha, hist]);
    expect(m.recon.matched).toBe(23);
    expect(m.recon.csvOnly).toEqual([]);
    expect(m.recon.allTradesOnly).toHaveLength(11);
  });

  it('pairs equal-quantity same-day trades by price, not by order', () => {
    const m = mergeSources([sh, fy]);
    const pair = m.txns.filter((t) => t.symbol === 'ACME' && t.exchangeDate === '2025-06-02');
    expect(pair).toHaveLength(2);
    for (const t of pair) {
      // Sharesight Value ≈ qty × price / rate; check the matched rate reproduces this row's price.
      const implied = (Number(t.nzdValue) * Number(t.fxForeignPerNzd)) / Math.abs(Number(t.qty));
      expect(Math.abs(implied - Number(t.price))).toBeLessThan(0.05);
    }
  });

  it('broker wins quantity/fees/timestamps; All Trades supplies FX, value and Hatch exchange/date', () => {
    const m = mergeSources([sh, ha, fy]);
    const h = m.txns.find((t) => t.source === 'hatch' && t.symbol === 'ROKT')!;
    expect(h.exchange).toBe('NASDAQ');
    expect(h.fxSource).toBe('sharesight_trade');
    expect(h.flags).toContain('matched_alltrades');
    expect(h.provenance).toHaveLength(2);
    const s = m.txns.find((t) => t.source === 'sharesies' && t.symbol === 'ZETF')!;
    expect(s.tsUtc).toBeDefined();
    expect(s.exchange).toBe('BATS');
  });

  it('passes non-trade rows (dividends, interest, deposits) through', () => {
    const m = mergeSources([sh, ha, fy]);
    expect(m.txns.filter((t) => t.type === 'DIVIDEND')).toHaveLength(7);
    expect(m.txns.filter((t) => t.type === 'INTEREST' || t.type === 'CASH')).toHaveLength(3);
  });

  it('is idempotent: uploading a file twice changes nothing', () => {
    const once = mergeSources([sh, ha, fy]);
    const twice = mergeSources([sh, ha, fy, sh, fy]);
    expect(twice.txns).toEqual(once.txns);
    expect(twice.recon.duplicatesIgnored).toHaveLength(2);
  });

  it('works with only one source', () => {
    expect(mergeSources([sh]).recon.csvOnly).toHaveLength(19);
    expect(mergeSources([fy]).recon.allTradesOnly).toHaveLength(27);
  });
});
