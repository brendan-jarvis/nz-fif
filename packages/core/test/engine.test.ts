import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculate, buildLedger, Decimal, money2, ORACLE_COMPAT_OPTIONS } from '../src/index';
import { fif, fixedFx, nzdPrice, tx } from './engine-helpers';

const fx = fixedFx();

// IR461 (April 2026) p.15-16, "Company A".
const companyA = [
  tx({ type: 'OPENING', date: '2024-06-01', qty: '10000', amount: '150000' }),
  tx({ type: 'BUY', date: '2025-10-01', qty: '5000', amount: '110000' }),
  tx({ type: 'SELL', date: '2025-12-01', qty: '-4000', amount: '100000' }),
  tx({ type: 'BUY', date: '2025-12-23', qty: '2000', amount: '44000' }),
];
const companyAPrices = { 'COA:US': { opening: nzdPrice('20'), closing: nzdPrice(new Decimal(254000).div(13000).toString()) } };

describe('IR461 worked examples', () => {
  it('Company A: peak differential 2,000, average cost $22, QSA $2,200, FDR $12,200', () => {
    const r = calculate({ txns: companyA, year: 2026, classes: fif('COA'), prices: companyAPrices, fx });
    const h = r.holdings[0]!;
    expect(h.peakDifferential.toString()).toBe('2000');
    expect(h.averageCost.toString()).toBe('22');
    expect(money2(h.peakAmount)).toBe('2200.00');
    expect(money2(h.qsGain)).toBe('12000.00');
    expect(money2(r.totals!.qsa)).toBe('2200.00');
    expect(money2(r.totals!.fdr)).toBe('12200.00');
    expect(r.totals!.qsaBinding).toBe('peak');
    // CV = (254,000 + 100,000) − (200,000 + 154,000) = 0
    expect(money2(r.totals!.cv)).toBe('0.00');
  });

  it('Bill Murphy: FDR $15,000; CV −$8,000 reduced to zero', () => {
    const txns = ['A', 'B', 'C'].map((s) => tx({ sym: s, type: 'OPENING', date: '2024-05-01', qty: '1000', amount: '1' }));
    const prices = {
      'A:US': { opening: nzdPrice('100'), closing: nzdPrice('102') },
      'B:US': { opening: nzdPrice('100'), closing: nzdPrice('110') },
      'C:US': { opening: nzdPrice('100'), closing: nzdPrice('80') },
    };
    const r = calculate({ txns, year: 2026, classes: fif('A', 'B', 'C'), prices, fx });
    expect(money2(r.totals!.fdr)).toBe('15000.00');
    expect(money2(r.totals!.cvRaw)).toBe('-8000.00');
    expect(money2(r.totals!.cv)).toBe('0.00');
    expect(r.totals!.cvFloored).toBe(true);
    expect(r.totals!.lower).toBe('CV');
  });
});

describe('quick sale adjustment', () => {
  // Two holdings: X has a peak amount but a loss; Y a gain but a small peak amount.
  const txns = [
    tx({ sym: 'X', type: 'BUY', date: '2025-05-01', qty: '100', amount: '1000' }),
    tx({ sym: 'X', type: 'SELL', date: '2025-06-01', qty: '-100', amount: '600' }),
    tx({ sym: 'Y', type: 'OPENING', date: '2025-01-01', qty: '10', amount: '100' }),
    tx({ sym: 'Y', type: 'BUY', date: '2025-05-01', qty: '10', amount: '100' }),
    tx({ sym: 'Y', type: 'SELL', date: '2025-07-01', qty: '-10', amount: '300' }),
  ];
  const prices = { 'X:US': {}, 'Y:US': { opening: nzdPrice('10'), closing: nzdPrice('30') } };
  it('portfolio QSA is the lesser of the TOTALS (s EX 52(7)), not a sum of per-holding minima', () => {
    const r = calculate({ txns, year: 2026, classes: fif('X', 'Y'), prices, fx });
    // X: peak diff 100, avg 10 → 50; gain 600 − 1000 = −400. Y: peak diff 10, avg 10 → 5; gain 300 − 100 = 200.
    expect(money2(r.totals!.sumPeakAmount)).toBe('55.00');
    expect(money2(r.totals!.sumQsGain)).toBe('-200.00');
    expect(money2(r.totals!.qsa)).toBe('0.00');
    const perHolding = calculate({ txns, year: 2026, classes: fif('X', 'Y'), prices, fx, options: { qsaScope: 'holding' } });
    expect(money2(perHolding.totals!.qsa)).toBe('5.00');
  });

  it('matches disposals LIFO at year-average cost by default; lot and FIFO are switches', () => {
    const t = [
      tx({ type: 'BUY', date: '2025-05-01', qty: '10', amount: '100' }), // 10 each
      tx({ type: 'BUY', date: '2025-06-01', qty: '10', amount: '300' }), // 30 each
      tx({ type: 'SELL', date: '2025-07-01', qty: '-10', amount: '250' }),
    ];
    const p = { 'COA:US': { opening: nzdPrice('0'), closing: nzdPrice('25') } };
    const avg = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: p, fx });
    expect(money2(avg.holdings[0]!.qsGain)).toBe('50.00'); // 250 − 10 × 20
    const lifoLot = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: p, fx, options: { qsGainCost: 'lot' } });
    expect(money2(lifoLot.holdings[0]!.qsGain)).toBe('-50.00'); // 250 − 300 (latest lot)
    const fifoLot = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: p, fx, options: { qsGainCost: 'lot', qsGainOrder: 'fifo' } });
    expect(money2(fifoLot.holdings[0]!.qsGain)).toBe('150.00'); // 250 − 100 (oldest lot)
  });

  it('is not required when the only disposal precedes the acquisition (strict s EX 52(6))', () => {
    const t = [
      tx({ type: 'OPENING', date: '2025-01-01', qty: '10', amount: '100' }),
      tx({ type: 'SELL', date: '2025-05-01', qty: '-5', amount: '100' }),
      tx({ type: 'BUY', date: '2025-06-01', qty: '5', amount: '50' }),
    ];
    const p = { 'COA:US': { opening: nzdPrice('10'), closing: nzdPrice('10') } };
    expect(calculate({ txns: t, year: 2026, classes: fif('COA'), prices: p, fx }).holdings[0]!.qsRequired).toBe(false);
    expect(calculate({ txns: t, year: 2026, classes: fif('COA'), prices: p, fx, options: ORACLE_COMPAT_OPTIONS }).holdings[0]!.qsRequired).toBe(true);
  });

  it('restates holdings in end-of-year units across a 2:1 split (s EX 54)', () => {
    const t = [
      tx({ type: 'BUY', date: '2025-05-01', qty: '10', amount: '1000' }),
      tx({ type: 'SPLIT', date: '2025-08-01', qty: '10' }),
      tx({ type: 'SELL', date: '2025-09-01', qty: '-20', amount: '1200' }),
    ];
    const p = { 'COA:US': { opening: nzdPrice('0'), closing: nzdPrice('0') } };
    const h = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: p, fx }).holdings[0]!;
    expect(h.hasReorg).toBe(true);
    expect(h.peakEq.toString()).toBe('20');
    expect(h.acquiredQtyEq.toString()).toBe('20');
    expect(h.averageCost.toString()).toBe('50');
    expect(money2(h.peakAmount)).toBe('50.00'); // 5% × 20 × 50
    expect(money2(h.qsGain)).toBe('200.00'); // 1200 − 20 × 50
    const lot = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: p, fx, options: { qsGainCost: 'lot' } }).holdings[0]!;
    expect(money2(lot.qsGain)).toBe('200.00');
  });

  it('property: 0 ≤ QSA ≤ Σ peak amount and QSA ≤ max(0, Σ gain)', () => {
    const trade = fc.record({ buy: fc.boolean(), qty: fc.integer({ min: 1, max: 50 }), px: fc.integer({ min: 1, max: 100 }), day: fc.integer({ min: 0, max: 360 }) });
    fc.assert(fc.property(fc.array(fc.array(trade, { maxLength: 8 }), { minLength: 1, maxLength: 4 }), (books) => {
      const txns = books.flatMap((book, bi) => {
        const sym = `S${bi}`;
        let held = 20;
        const out = [tx({ sym, type: 'OPENING', date: '2025-01-01', qty: '20', amount: '200' })];
        for (const t of [...book].sort((a, b) => a.day - b.day)) {
          const date = new Date(Date.UTC(2025, 3, 1 + t.day)).toISOString().slice(0, 10);
          const q = t.buy ? t.qty : Math.min(t.qty, held);
          if (q === 0) continue;
          held += t.buy ? q : -q;
          out.push(tx({ sym, type: t.buy ? 'BUY' : 'SELL', date, qty: String(t.buy ? q : -q), amount: String(q * t.px) }));
        }
        return out;
      });
      const keys = books.map((_, i) => `S${i}`);
      const prices = Object.fromEntries(keys.map((k) => [`${k}:US`, { opening: nzdPrice('10'), closing: nzdPrice('12') }]));
      const r = calculate({ txns, year: 2026, classes: fif(...keys), prices, fx });
      const t = r.totals!;
      return t.qsa.gte(0) && t.qsa.lte(t.sumPeakAmount) && t.qsa.lte(Decimal.max(0, t.sumQsGain));
    }), { numRuns: 200 });
  });
});

describe('ledger', () => {
  it('uses the exchange date by default and the NZ date when asked, and flags boundary trades', () => {
    const t = [tx({ type: 'BUY', date: '2025-03-31', nzDate: '2025-04-01', qty: '5', amount: '50' })];
    const ex = buildLedger(t, { year: 2026, dateBasis: 'exchange' }).get('COA:US')!;
    const nz = buildLedger(t, { year: 2026, dateBasis: 'nz' }).get('COA:US')!;
    expect(ex.openingQty.toString()).toBe('5');
    expect(nz.openingQty.toString()).toBe('0');
    expect(ex.flags).toContain('trade_on_income_year_boundary_date_basis_matters');
  });

  it('property: a split conserves value (qty × price) and keeps peak/opening consistent', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 2, max: 10 }), (q, ratio) => {
      const t = [tx({ type: 'OPENING', date: '2025-01-01', qty: String(q), amount: '1' }), tx({ type: 'SPLIT', date: '2025-06-01', qty: String(q * (ratio - 1)) })];
      const p = buildLedger(t, { year: 2026, dateBasis: 'exchange' }).get('COA:US')!;
      const before = new Decimal(q).times(100);
      const after = p.closingQty.times(new Decimal(100).div(ratio));
      return before.minus(after).abs().lt('1e-20') && p.openingEq.eq(p.closingQty) && p.peakEq.eq(p.closingQty);
    }));
  });
});

describe('valuation, FX, FTC, de minimis', () => {
  it('values USD holdings at the RBNZ rate for 31 March and blocks on a missing price', () => {
    const t = [tx({ type: 'OPENING', date: '2025-01-01', qty: '10', amount: '100', ccy: 'USD', price: '10' })];
    const ok = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: { 'COA:US': { opening: { price: '10', currency: 'USD', source: 't' }, closing: { price: '11', currency: 'USD', source: 't' } } }, fx });
    expect(money2(ok.totals!.openingMvNzd)).toBe('200.00');
    expect(money2(ok.totals!.closingMvNzd)).toBe('220.00');
    const missing = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: {}, fx });
    expect(missing.blocked).toBe(true);
    expect(missing.totals).toBeNull();
    const review = calculate({ txns: t, year: 2026, classes: {}, prices: {}, fx });
    expect(review.blockers[0]).toContain('classification needed');
  });

  it('caps the foreign tax credit per holding at NZ tax on that holding', () => {
    const t = [
      tx({ type: 'OPENING', date: '2025-01-01', qty: '100', amount: '1000' }),
      tx({ type: 'DIVIDEND', date: '2025-09-01', qty: '0', gross: '100', wht: '15' }),
    ];
    const r = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: { 'COA:US': { opening: nzdPrice('10'), closing: nzdPrice('10') } }, fx, options: { marginalRate: '0.33' } });
    // FDR income 50 → NZ tax 16.50 → FTC = min(15, 16.50) = 15. CV income = 100 (dividend) → FTC 15.
    expect(money2(r.totals!.fdr)).toBe('50.00');
    expect(money2(r.totals!.ftcFdr)).toBe('15.00');
    expect(money2(r.totals!.cv)).toBe('100.00');
    const small = calculate({ txns: [t[0]!, tx({ type: 'DIVIDEND', date: '2025-09-01', qty: '0', gross: '200', wht: '30' })], year: 2026, classes: fif('COA'), prices: { 'COA:US': { opening: nzdPrice('2'), closing: nzdPrice('2') } }, fx, options: { marginalRate: '0.33' } });
    expect(money2(small.totals!.ftcFdr)).toBe('3.30'); // 0.33 × FDR 10
  });

  it('de minimis: running FIFO cost, peak and date, NZ$50,000 test', () => {
    const t = [
      tx({ type: 'BUY', date: '2025-01-10', qty: '100', amount: '30000' }),
      tx({ type: 'BUY', date: '2025-06-10', qty: '100', amount: '25000' }),
      tx({ type: 'SELL', date: '2025-07-10', qty: '-100', amount: '40000' }), // FIFO removes the 30,000 lot
    ];
    const r = calculate({ txns: t, year: 2026, classes: fif('COA'), prices: { 'COA:US': { opening: nzdPrice('300'), closing: nzdPrice('300') } }, fx });
    expect(money2(r.deMinimis.openingCostNzd)).toBe('30000.00');
    expect(money2(r.deMinimis.peakCostNzd)).toBe('55000.00');
    expect(r.deMinimis.peakDate).toBe('2025-06-10');
    expect(r.deMinimis.exceeds).toBe(true);
  });
});
