import { describe, expect, it } from 'vitest';
import { suggestClass, yahooSymbol, parseAssumptions, serializeAssumptions, cashFund, compareCashFunds, money2, type Assumptions } from '../src/index';
import { fixedFx, tx } from './engine-helpers';

const h = (symbol: string, exchange: string, name = 'Some Co', assetClass: 'share' | 'crypto' | 'cash_mmf' | 'other' | 'etf' = 'share') => ({ key: `${symbol}:${exchange}`, symbol, exchange, name, assetClass });

describe('suggestClass (PLAN §5 rules in order)', () => {
  it('crypto → not FIF, including OTHER-market tokens', () => {
    expect(suggestClass(h('BTC', 'CRYPTO', 'Bitcoin', 'crypto')).fifClass).toBe('not_fif');
    const tok = suggestClass(h('FAKETKN', 'OTHER', 'Fake Staked Token', 'other'));
    expect(tok.fifClass).toBe('not_fif');
    expect(tok.caution).toBeDefined();
  });
  it('money market → cash/MMF; NZX → not FIF with caution; ASX → review; unknown → review; US → FIF', () => {
    expect(suggestClass(h('DAGXX', 'US', 'Dreyfus Government', 'cash_mmf')).fifClass).toBe('cash_mmf');
    const nzx = suggestClass(h('FPH', 'NZX'));
    expect(nzx.fifClass).toBe('not_fif');
    expect(nzx.caution).toMatch(/foreign/);
    const asx = suggestClass(h('CSL', 'ASX'));
    expect(asx.fifClass).toBe('review');
    expect(asx.reason).toContain('https://www.ird.govt.nz/fif-australia-tool');
    expect(suggestClass(h('ODD', 'OTHER', 'Odd Holdings')).fifClass).toBe('review');
    expect(suggestClass(h('ACME', 'NASDAQ')).fifClass).toBe('fif');
    expect(suggestClass(h('VOD', 'LSE')).fifClass).toBe('fif');
  });
  it('maps Yahoo symbols', () => {
    expect(yahooSymbol('BRK.B', 'NYSE')).toBe('BRK-B');
    expect(yahooSymbol('CSL', 'ASX')).toBe('CSL.AX');
    expect(yahooSymbol('FPH', 'NZX')).toBe('FPH.NZ');
    expect(yahooSymbol('VOD', 'LSE')).toBe('VOD.L');
    expect(yahooSymbol('SHOP', 'TSX')).toBe('SHOP.TO');
  });
});

describe('assumptions.json', () => {
  const a: Assumptions = {
    format: 'nz-fif-assumptions', version: 1, year: 2026,
    holdings: [{ key: 'ACME:US', fifClass: 'fif', source: 'rule', rule: 'foreign_listed', reason: 'x', yahooSymbol: 'ACME' }],
    options: { dateBasis: 'nz', qsGainCost: 'lot' },
    cashFunds: { include: true, treatment: 'cv', balances: { 'DAGXX:US': { openingBalance: '100.5', closingBalance: '0', exitDate: '2026-01-15' } }, dividendAssignments: { 'hatch:hatch.csv#12': 'DAGXX:US' } },
    hatchGrossUpRate: '0.15',
    prices: { 'ACME:US': { opening: { price: '10.5', currency: 'USD', source: 'manual', date: '2025-03-31' } } },
  };
  it('round-trips', () => {
    expect(parseAssumptions(serializeAssumptions(a))).toEqual(a);
  });
  it('rejects other formats and drops invalid entries', () => {
    expect(() => parseAssumptions('{"format":"x"}')).toThrow();
    const bad = JSON.parse(serializeAssumptions(a));
    bad.holdings.push({ key: '<script>', fifClass: 'fif' }, { key: 'OK:US', fifClass: 'bogus' });
    bad.prices['ACME:US'].closing = { price: '1e999', currency: 'USD' };
    bad.options.marginalRate = '7';
    const p = parseAssumptions(JSON.stringify(bad));
    expect(p.holdings).toHaveLength(1);
    expect(p.prices['ACME:US']!.closing).toBeUndefined();
    expect(p.options.marginalRate).toBeUndefined();
  });
});

describe('cash funds', () => {
  it('CV only by default: FX effect plus dividends, added to both totals', () => {
    const fx = fixedFx(0.5);
    const divs = [tx({ sym: 'DAGXX', type: 'DIVIDEND', date: '2025-06-01', qty: '0', ccy: 'USD', gross: '10', wht: '0' })];
    const r = cashFund({ key: 'DAGXX:US', currency: 'USD', openingBalance: '1000', closingBalance: '0', exitDate: '2026-01-15' }, divs, 2026, fx);
    expect(money2(r.openingNzd)).toBe('2000.00');
    expect(money2(r.exitProceedsNzd)).toBe('2000.00');
    expect(money2(r.cv)).toBe('20.00');
    expect(money2(r.fdr)).toBe('100.00');
    const cmp = compareCashFunds([r], 'cv');
    expect(money2(cmp.addToFdr)).toBe('20.00');
    const same = compareCashFunds([r], 'same');
    expect(money2(same.addToFdr)).toBe('100.00');
    expect(money2(same.addToCv)).toBe('20.00');
  });
});
