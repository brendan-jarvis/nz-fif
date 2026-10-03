// FIF income: FDR (s EX 52) with the quick sale adjustment, CV (s EX 51),
// method choice, foreign tax credits and the NZ$50,000 de minimis.
// NOT TAX ADVICE. Citations: IR461 (April 2026), Income Tax Act 2007 subpart EX.
import { Decimal, ZERO, ONE, sum } from './decimal';
import { addDays, incomeYear } from './dates';
import type { FxMode, FxTable } from './fx';
import { buildLedger, isRelevant, type DateBasis, type LedgerEvent, type Position, txnDate } from './ledger';
import type { Txn } from './types';

export const FDR_RATE = new Decimal('0.05');
export const DE_MINIMIS_NZD = new Decimal('50000');

export type FifClass = 'fif' | 'not_fif' | 'cash_mmf' | 'excluded' | 'review';

export interface PriceInput {
  /** Price per unit in `currency` (use the unadjusted price: Yahoo rawClose). */
  price: string;
  currency: string;
  /** Trading date the price is for. */
  date?: string;
  source: string;
}

export interface CalcOptions {
  dateBasis: DateBasis;
  fxMode: FxMode;
  /** s EX 52(12): 'average' = statute (year-average cost); 'lot' = each acquisition's own cost. */
  qsGainCost: 'average' | 'lot';
  /** s EX 52(13) says LIFO. 'fifo' exists only to reproduce the reference implementation. */
  qsGainOrder: 'lifo' | 'fifo';
  /**
   * s EX 52(7): QSA = lesser of the TOTAL peak holding amount and the TOTAL quick
   * sale gain. 'holding' (min per holding) exists only to reproduce the reference.
   */
  qsaScope: 'portfolio' | 'holding';
  /** Require the disposal to come after an in-year acquisition (s EX 52(6)). */
  qsaStrictOrder: boolean;
  includeDividends: boolean;
  /** Marginal tax rate used to cap foreign tax credits, e.g. '0.39'. */
  marginalRate: string;
}

export const DEFAULT_OPTIONS: CalcOptions = {
  dateBasis: 'exchange',
  fxMode: 'rbnz',
  qsGainCost: 'average',
  qsGainOrder: 'lifo',
  qsaScope: 'portfolio',
  qsaStrictOrder: true,
  includeDividends: true,
  marginalRate: '0.39',
};

/** Settings that reproduce the private reference implementation (for differential tests). */
export const ORACLE_COMPAT_OPTIONS: CalcOptions = {
  dateBasis: 'exchange',
  fxMode: 'trade',
  qsGainCost: 'lot',
  qsGainOrder: 'fifo',
  qsaScope: 'holding',
  qsaStrictOrder: false,
  includeDividends: false,
  marginalRate: '0.39',
};

export interface CalcInput {
  txns: Txn[];
  year: number;
  classes: Record<string, FifClass>;
  prices: Record<string, { opening?: PriceInput; closing?: PriceInput }>;
  fx: FxTable;
  options?: Partial<CalcOptions>;
}

export interface QsGainRow {
  disposalDate: string;
  acquisitionDate: string;
  /** Units matched, in units held on the disposal date. */
  units: Decimal;
  /** Units restated to end-of-year units (s EX 54). */
  equivalentUnits: Decimal;
  proceedsNzd: Decimal;
  costNzd: Decimal;
  gainNzd: Decimal;
}

export interface Valuation {
  qty: Decimal;
  price: Decimal | null;
  currency: string;
  priceDate?: string;
  priceSource?: string;
  nzdPerUnit: Decimal | null;
  fxSource?: string;
  mvNzd: Decimal | null;
}

export interface HoldingResult {
  key: string;
  symbol: string;
  exchange: string;
  name: string;
  currency: string;
  fifClass: FifClass;
  accounts: string[];
  sources: string[];
  opening: Valuation;
  closing: Valuation;
  openingEq: Decimal;
  peakEq: Decimal;
  peakDate: string;
  hasReorg: boolean;
  acquiredQtyEq: Decimal;
  acquisitionsNzd: Decimal;
  disposedQty: Decimal;
  disposalsNzd: Decimal;
  brokerageNzd: Decimal;
  dividendsGrossNzd: Decimal;
  withholdingNzd: Decimal;
  fdrBase: Decimal | null;
  qsRequired: boolean;
  peakDifferential: Decimal;
  averageCost: Decimal;
  peakAmount: Decimal;
  qsGain: Decimal;
  qsGainRows: QsGainRow[];
  qsa: Decimal;
  fdrIncome: Decimal | null;
  cvIncome: Decimal | null;
  ftcFdr: Decimal;
  ftcCv: Decimal;
  included: boolean;
  flags: string[];
}

export interface DeMinimis {
  openingCostNzd: Decimal;
  peakCostNzd: Decimal;
  peakDate: string;
  exceeds: boolean;
  costIncomplete: boolean;
}

export interface PortfolioResult {
  year: number;
  start: string;
  end: string;
  options: CalcOptions;
  holdings: HoldingResult[];
  /** True if any holding still needs a classification or a price. */
  blocked: boolean;
  blockers: string[];
  totals: {
    openingMvNzd: Decimal;
    closingMvNzd: Decimal;
    fdrBase: Decimal;
    sumPeakAmount: Decimal;
    sumQsGain: Decimal;
    qsa: Decimal;
    qsaBinding: 'peak' | 'gain' | 'none';
    fdr: Decimal;
    cvRaw: Decimal;
    cv: Decimal;
    cvFloored: boolean;
    lower: 'FDR' | 'CV' | 'equal';
    ftcFdr: Decimal;
    ftcCv: Decimal;
    dividendsGrossNzd: Decimal;
    withholdingNzd: Decimal;
  } | null;
  deMinimis: DeMinimis;
  fxNotes: string[];
}

const ACQ = new Set(['BUY', 'DRP', 'TRANSFER_IN', 'OPENING']);
const DISP = new Set(['SELL', 'TRANSFER_OUT']);

/** NZD amount of a trade (positive), per the FX mode. */
export function tradeNzd(t: Txn, fx: FxTable, mode: FxMode, basis: DateBasis, flags: Set<string>): Decimal {
  let foreign = new Decimal(t.cashAmount || '0').abs();
  if (foreign.isZero() && t.price) foreign = new Decimal(t.qty).abs().times(t.price);
  if (mode === 'trade') {
    if (t.nzdValue) return new Decimal(t.nzdValue).abs();
    if (t.fxForeignPerNzd && !new Decimal(t.fxForeignPerNzd).isZero()) return foreign.div(t.fxForeignPerNzd);
    flags.add('trade_without_sharesight_rate_used_rbnz');
  }
  if (t.currency === 'NZD') return foreign;
  const date = txnDate(t, basis);
  const rate = fx.nzdPerUnit(t.currency, date);
  if (rate) return foreign.times(rate);
  if (t.nzdValue) { flags.add('rbnz_rate_missing_used_sharesight_value'); return new Decimal(t.nzdValue).abs(); }
  if (t.fxForeignPerNzd) { flags.add('rbnz_rate_missing_used_sharesight_rate'); return foreign.div(t.fxForeignPerNzd); }
  flags.add(`fx_missing:${t.currency}:${date}`);
  return ZERO;
}

function feeNzd(t: Txn, fx: FxTable, basis: DateBasis): Decimal {
  const fee = new Decimal(t.fee || '0');
  if (fee.isZero()) return ZERO;
  if (t.feeCcy === 'NZD') return fee;
  const r = fx.nzdPerUnit(t.feeCcy || t.currency, txnDate(t, basis));
  return r ? fee.times(r) : ZERO;
}

function value(qty: Decimal, p: PriceInput | undefined, fx: FxTable, fxDate: string, currency: string, flags: Set<string>, label: string): Valuation {
  if (qty.isZero()) return { qty, price: p ? new Decimal(p.price) : null, currency, nzdPerUnit: null, mvNzd: ZERO };
  if (!p) { flags.add(`missing_${label}_price`); return { qty, price: null, currency, nzdPerUnit: null, mvNzd: null }; }
  const ccy = p.currency || currency;
  if (currency && ccy !== currency) flags.add(`${label}_price_currency_${ccy}_differs_from_${currency}`);
  const q = fx.quote(ccy, fxDate);
  if (!q) { flags.add(`missing_${label}_fx:${ccy}`); return { qty, price: new Decimal(p.price), currency: ccy, nzdPerUnit: null, mvNzd: null }; }
  const nzdPerUnit = ONE.div(q.foreignPerNzd);
  const price = new Decimal(p.price);
  return {
    qty, price, currency: ccy, ...(p.date ? { priceDate: p.date } : {}), priceSource: p.source,
    nzdPerUnit, fxSource: q.source, mvNzd: qty.times(price).times(nzdPerUnit),
  };
}

function quickSale(p: Position, fx: FxTable, o: CalcOptions, flags: Set<string>) {
  let acquiredEq = ZERO, acqCost = ZERO, disposedQty = ZERO, proceedsTotal = ZERO;
  let firstAcq = -1, disposalAfterAcq = false, anyAcq = false, anyDisp = false;
  p.inYear.forEach((e, i) => {
    const q = new Decimal(e.txn.qty);
    if (ACQ.has(e.txn.type) && q.gt(0)) {
      anyAcq = true;
      if (firstAcq < 0) firstAcq = i;
      acquiredEq = acquiredEq.plus(q.times(e.factorToEnd));
      acqCost = acqCost.plus(tradeNzd(e.txn, fx, o.fxMode, o.dateBasis, flags));
    } else if (DISP.has(e.txn.type) && q.lt(0)) {
      anyDisp = true;
      if (firstAcq >= 0) disposalAfterAcq = true;
      disposedQty = disposedQty.plus(q.neg());
      proceedsTotal = proceedsTotal.plus(tradeNzd(e.txn, fx, o.fxMode, o.dateBasis, flags));
    }
  });
  const required = o.qsaStrictOrder ? disposalAfterAcq : anyAcq && anyDisp;
  const averageCost = acquiredEq.isZero() ? ZERO : acqCost.div(acquiredEq);
  const rows: QsGainRow[] = [];
  let peakDifferential = ZERO, peakAmount = ZERO, gain = ZERO;
  if (required) {
    const a = p.peakEq.minus(p.openingEq), b = p.peakEq.minus(p.closingQty);
    peakDifferential = Decimal.max(ZERO, Decimal.min(a, b));
    peakAmount = FDR_RATE.times(peakDifferential).times(averageCost);
    // Quick sale gain: match disposals to earlier in-year acquisitions.
    const lots: Array<{ qty: Decimal; costPerUnit: Decimal; date: string }> = [];
    for (const e of p.inYear) {
      const q = new Decimal(e.txn.qty);
      if (e.ratio) {
        for (const l of lots) { l.qty = l.qty.times(e.ratio); l.costPerUnit = l.costPerUnit.div(e.ratio); }
        continue;
      }
      if (ACQ.has(e.txn.type) && q.gt(0)) {
        lots.push({ qty: q, costPerUnit: tradeNzd(e.txn, fx, o.fxMode, o.dateBasis, flags).div(q), date: e.date });
      } else if (DISP.has(e.txn.type) && q.lt(0)) {
        let need = q.neg();
        const ppu = tradeNzd(e.txn, fx, o.fxMode, o.dateBasis, flags).div(need);
        const order = o.qsGainOrder === 'lifo' ? [...lots].reverse() : lots;
        for (const l of order) {
          if (need.lte(0)) break;
          if (l.qty.lte(0)) continue;
          const take = Decimal.min(l.qty, need);
          const eqUnits = take.times(e.factorToEnd);
          const cost = o.qsGainCost === 'average' ? eqUnits.times(averageCost) : take.times(l.costPerUnit);
          const proceeds = take.times(ppu);
          rows.push({ disposalDate: e.date, acquisitionDate: l.date, units: take, equivalentUnits: eqUnits, proceedsNzd: proceeds, costNzd: cost, gainNzd: proceeds.minus(cost) });
          l.qty = l.qty.minus(take);
          need = need.minus(take);
        }
      }
    }
    gain = sum(rows.map((r) => r.gainNzd));
    if (p.dividends.length > 0) flags.add('qs_gain_excludes_dividends_on_quick_sale_shares');
  }
  return { required, averageCost, peakDifferential, peakAmount, gain, rows, acquiredEq, acqCost, disposedQty, proceedsTotal };
}

export function calculate(input: CalcInput): PortfolioResult {
  const o: CalcOptions = { ...DEFAULT_OPTIONS, ...(input.options ?? {}) };
  const { start, end } = incomeYear(input.year);
  const openFxDate = addDays(start, -1); // IRD: the 31 March rate may be used for 1 April.
  const ledger = buildLedger(input.txns, { year: input.year, dateBasis: o.dateBasis });
  const rate = new Decimal(o.marginalRate);
  const holdings: HoldingResult[] = [];
  const blockers: string[] = [];

  for (const p of [...ledger.values()].filter(isRelevant).sort((a, b) => a.key.localeCompare(b.key))) {
    const fifClass = input.classes[p.key] ?? 'review';
    const flags = new Set<string>(p.flags);
    const price = input.prices[p.key] ?? {};
    const included = fifClass === 'fif';
    const opening = value(p.openingQty, price.opening, input.fx, openFxDate, p.currency, included ? flags : new Set(), 'opening');
    const closing = value(p.closingQty, price.closing, input.fx, end, p.currency, included ? flags : new Set(), 'closing');
    const qs = quickSale(p, input.fx, o, flags);
    let brokerage = ZERO;
    for (const e of p.inYear) brokerage = brokerage.plus(feeNzd(e.txn, input.fx, o.dateBasis));
    let divGross = ZERO, wht = ZERO;
    for (const d of p.dividends) {
      if (!d.dividend) continue;
      const r = d.currency === 'NZD' ? ONE : input.fx.nzdPerUnit(d.currency, txnDate(d, o.dateBasis));
      if (!r) { flags.add(`fx_missing_dividend:${d.currency}`); continue; }
      divGross = divGross.plus(new Decimal(d.dividend.gross).times(r));
      wht = wht.plus(new Decimal(d.dividend.wht).times(r));
      if (d.dividend.grossUpRate) flags.add('dividend_grossed_up_assumed_withholding');
    }
    if (p.hasReorg) flags.add('share_reorganisation_in_year_s_EX_54');
    const fdrBase = opening.mvNzd === null ? null : FDR_RATE.times(opening.mvNzd);
    const cv = opening.mvNzd === null || closing.mvNzd === null ? null
      : closing.mvNzd.plus(qs.proceedsTotal).plus(o.includeDividends ? divGross : ZERO).minus(opening.mvNzd).minus(qs.acqCost);
    if (!o.includeDividends) flags.add('cv_excludes_dividends');
    const holdingQsa = qs.required ? Decimal.min(qs.peakAmount, Decimal.max(ZERO, qs.gain)) : ZERO;
    if (fifClass === 'review') blockers.push(`${p.key}: classification needed`);
    if (included && (opening.mvNzd === null || closing.mvNzd === null)) blockers.push(`${p.key}: price needed`);
    holdings.push({
      key: p.key, symbol: p.symbol, exchange: p.exchange, name: p.name, currency: p.currency, fifClass,
      accounts: p.accounts, sources: p.sources, opening, closing,
      openingEq: p.openingEq, peakEq: p.peakEq, peakDate: p.peakDate, hasReorg: p.hasReorg,
      acquiredQtyEq: qs.acquiredEq, acquisitionsNzd: qs.acqCost, disposedQty: qs.disposedQty, disposalsNzd: qs.proceedsTotal,
      brokerageNzd: brokerage, dividendsGrossNzd: divGross, withholdingNzd: wht,
      fdrBase, qsRequired: qs.required, peakDifferential: qs.peakDifferential, averageCost: qs.averageCost,
      peakAmount: qs.peakAmount, qsGain: qs.gain, qsGainRows: qs.rows, qsa: holdingQsa,
      fdrIncome: null, cvIncome: cv, ftcFdr: ZERO, ftcCv: ZERO, included, flags: [...flags].sort(),
    });
  }

  const inc = holdings.filter((h) => h.included);
  const deMinimis = computeDeMinimis(ledger, input, o, start, end);
  const blocked = blockers.length > 0;
  let totals: PortfolioResult['totals'] = null;
  if (!blocked) {
    const sumPeak = sum(inc.map((h) => h.peakAmount));
    const sumGain = sum(inc.map((h) => h.qsGain));
    let qsa: Decimal;
    let binding: 'peak' | 'gain' | 'none' = 'none';
    if (o.qsaScope === 'portfolio') {
      // s EX 52(7): lesser of total peak holding amount and total quick sale gain (negative total → 0).
      const g = Decimal.max(ZERO, sumGain);
      qsa = Decimal.min(sumPeak, g);
      binding = sumPeak.isZero() && g.isZero() ? 'none' : sumPeak.lte(g) ? 'peak' : 'gain';
      for (const h of inc) h.qsa = sumPeak.isZero() ? ZERO : qsa.times(h.peakAmount).div(sumPeak);
    } else {
      qsa = sum(inc.map((h) => h.qsa));
    }
    for (const h of inc) h.fdrIncome = h.fdrBase!.plus(h.qsa);
    const fdrBase = sum(inc.map((h) => h.fdrBase!));
    const fdr = fdrBase.plus(qsa);
    const cvRaw = sum(inc.map((h) => h.cvIncome!));
    const cvFloored = cvRaw.lt(0);
    const cv = cvFloored ? ZERO : cvRaw;
    // FTC per holding: lesser of foreign tax paid and NZ tax on that holding's FIF income (IR461 p.20).
    for (const h of inc) {
      h.ftcFdr = Decimal.min(h.withholdingNzd, Decimal.max(ZERO, h.fdrIncome!).times(rate));
      h.ftcCv = cvFloored ? ZERO : Decimal.min(h.withholdingNzd, Decimal.max(ZERO, h.cvIncome!).times(rate));
    }
    totals = {
      openingMvNzd: sum(inc.map((h) => h.opening.mvNzd!)),
      closingMvNzd: sum(inc.map((h) => h.closing.mvNzd!)),
      fdrBase, sumPeakAmount: sumPeak, sumQsGain: sumGain, qsa, qsaBinding: binding, fdr, cvRaw, cv, cvFloored,
      lower: cv.lt(fdr) ? 'CV' : fdr.lt(cv) ? 'FDR' : 'equal',
      ftcFdr: sum(inc.map((h) => h.ftcFdr)), ftcCv: sum(inc.map((h) => h.ftcCv)),
      dividendsGrossNzd: sum(inc.map((h) => h.dividendsGrossNzd)), withholdingNzd: sum(inc.map((h) => h.withholdingNzd)),
    };
  }
  const fxNotes = [
    o.fxMode === 'rbnz'
      ? `RBNZ B1 actual daily rates (snapshot published ${input.fx.published}); market values use the rate for ${openFxDate} and ${end}.`
      : `Trades use Sharesight per-trade rates (match mode); market values use RBNZ B1 rates for ${openFxDate} and ${end}.`,
  ];
  return { year: input.year, start, end, options: o, holdings, blocked, blockers, totals, deMinimis, fxNotes };
}

/**
 * De minimis (IR461 p.9): running FIFO cost in NZD of the included interests,
 * checked at the end of every day in the year.
 */
function computeDeMinimis(ledger: Map<string, Position>, input: CalcInput, o: CalcOptions, start: string, end: string): DeMinimis {
  const flags = new Set<string>();
  type Lot = { qty: Decimal; cost: Decimal };
  const lots = new Map<string, Lot[]>();
  const all: LedgerEvent[] = [];
  for (const p of ledger.values()) if (input.classes[p.key] === 'fif') all.push(...p.events);
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let total = ZERO, peak = ZERO, peakDate = start, opening: Decimal | null = null, incomplete = false;
  let i = 0;
  const step = (e: LedgerEvent) => {
    const k = e.txn.instrumentKey;
    const list = lots.get(k) ?? [];
    lots.set(k, list);
    const q = new Decimal(e.txn.qty);
    if (e.ratio) { for (const l of list) l.qty = l.qty.times(e.ratio); return; }
    if (q.gt(0)) {
      const c = tradeNzd(e.txn, input.fx, o.fxMode, o.dateBasis, flags);
      if (c.isZero()) incomplete = true;
      list.push({ qty: q, cost: c });
      total = total.plus(c);
    } else if (q.lt(0)) {
      let need = q.neg();
      while (need.gt(0) && list.length) {
        const l = list[0]!;
        const take = Decimal.min(l.qty, need);
        const c = l.qty.isZero() ? ZERO : l.cost.times(take).div(l.qty);
        l.cost = l.cost.minus(c); l.qty = l.qty.minus(take); total = total.minus(c); need = need.minus(take);
        if (l.qty.lte(new Decimal('1e-10'))) { total = total.minus(l.cost); list.shift(); }
      }
    }
  };
  while (i < all.length && all[i]!.date < start) step(all[i++]!);
  opening = total; peak = total;
  while (i < all.length && all[i]!.date <= end) {
    const d = all[i]!.date;
    while (i < all.length && all[i]!.date === d) step(all[i++]!);
    if (total.gt(peak)) { peak = total; peakDate = d; }
  }
  return { openingCostNzd: opening, peakCostNzd: peak, peakDate, exceeds: peak.gt(DE_MINIMIS_NZD), costIncomplete: incomplete || flags.size > 0 };
}
