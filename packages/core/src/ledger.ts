// Quantity ledger per instrument across all accounts (PLAN §7).
// Opening = Σ signed qty for dates < 1 Apr; closing = Σ for dates ≤ 31 Mar;
// the date used is the exchange date or the NZ date (`dateBasis`).
// Share reorganisations in the year are handled per s EX 54: every holding is
// restated as an "equivalent shareholding" in end-of-year units.
import { Decimal, ONE, ZERO, isZeroQty } from './decimal';
import { incomeYear } from './dates';
import type { Txn, TxnType } from './types';

export type DateBasis = 'exchange' | 'nz';

const QTY_TYPES: ReadonlySet<TxnType> = new Set(['BUY', 'SELL', 'DRP', 'SPLIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'OPENING']);
const INCOME_TYPES: ReadonlySet<TxnType> = new Set(['DIVIDEND']);

/**
 * Same-day ordering. Unknown intraday order: acquisitions before disposals
 * (as the reference implementation and, apparently, Sharesight do), with a
 * merge's cancel leg before its buy leg.
 */
export function sameDayOrder(t: Txn): number {
  switch (t.type) {
    case 'OPENING': return 0;
    case 'BUY': return t.flags.includes('corporate_action_merge_buy') ? 4 : 1;
    case 'DRP': return 2;
    case 'TRANSFER_IN': return 2;
    case 'SELL': return t.flags.includes('corporate_action_merge_cancel') ? 3 : 7;
    case 'SPLIT': return 5;
    case 'TRANSFER_OUT': return 8;
    default: return 9;
  }
}

export function txnDate(t: Txn, basis: DateBasis): string {
  return basis === 'nz' ? t.nzDate : t.exchangeDate;
}

export interface LedgerEvent {
  txn: Txn;
  date: string;
  /** Units held before and after this event (actual units on the day). */
  before: Decimal;
  after: Decimal;
  /** For SPLIT events: units after / units before. */
  ratio?: Decimal;
  /** Π of split ratios of in-year reorganisations after this event (s EX 54). */
  factorToEnd: Decimal;
}

export interface Position {
  key: string;
  symbol: string;
  exchange: string;
  name: string;
  currency: string;
  assetClass: Txn['assetClass'];
  accounts: string[];
  sources: string[];
  openingQty: Decimal;
  closingQty: Decimal;
  /** Opening holding restated in end-of-year units (= openingQty without a reorganisation). */
  openingEq: Decimal;
  /** Greatest equivalent shareholding in the year (opening included) and the date first reached. */
  peakEq: Decimal;
  peakDate: string;
  hasReorg: boolean;
  /** Every quantity event, all history up to the year end, in ledger order. */
  events: LedgerEvent[];
  /** The subset of `events` inside the income year. */
  inYear: LedgerEvent[];
  /** In-year dividend rows. */
  dividends: Txn[];
  flags: string[];
}

export interface LedgerOptions {
  year: number;
  dateBasis: DateBasis;
}

export function buildLedger(txns: Txn[], opts: LedgerOptions): Map<string, Position> {
  const { start, end } = incomeYear(opts.year);
  const byKey = new Map<string, Array<{ t: Txn; i: number }>>();
  txns.forEach((t, i) => {
    if (!QTY_TYPES.has(t.type) && !INCOME_TYPES.has(t.type)) return;
    const list = byKey.get(t.instrumentKey) ?? [];
    list.push({ t, i });
    byKey.set(t.instrumentKey, list);
  });

  const out = new Map<string, Position>();
  for (const [key, list] of byKey) {
    list.sort((a, b) => {
      const da = txnDate(a.t, opts.dateBasis), db = txnDate(b.t, opts.dateBasis);
      if (da !== db) return da < db ? -1 : 1;
      const oa = sameDayOrder(a.t), ob = sameDayOrder(b.t);
      return oa !== ob ? oa - ob : a.i - b.i;
    });
    const flags = new Set<string>();
    const events: LedgerEvent[] = [];
    const dividends: Txn[] = [];
    let running = ZERO;
    let openingQty: Decimal | null = null;
    const accounts = new Set<string>();
    const sources = new Set<string>();
    let name = '', currency = '';
    for (const { t } of list) {
      const date = txnDate(t, opts.dateBasis);
      if (date > end) continue;
      if (t.name) name = t.name;
      if (t.currency) currency = t.currency;
      accounts.add(t.account);
      sources.add(t.source);
      if (date >= start && openingQty === null) openingQty = snap(running);
      if (t.type === 'DIVIDEND') {
        if (date >= start) dividends.push(t);
        continue;
      }
      const before = running;
      const q = new Decimal(t.qty);
      running = running.plus(q);
      let ratio: Decimal | undefined;
      if (t.type === 'SPLIT') {
        if (t.splitRatio) ratio = new Decimal(t.splitRatio);
        else if (before.gt(0)) ratio = before.plus(q).div(before);
        else flags.add('split_with_no_prior_holding');
      }
      if (running.lt(0) && !isZeroQty(running)) flags.add('negative_holding');
      // Boundary sensitivity: exchange and NZ dates fall in different income years.
      if ((t.exchangeDate < start) !== (t.nzDate < start) || (t.exchangeDate > end) !== (t.nzDate > end)) {
        flags.add('trade_on_income_year_boundary_date_basis_matters');
      }
      events.push({ txn: t, date, before, after: running, ...(ratio ? { ratio } : {}), factorToEnd: ONE });
    }
    if (openingQty === null) openingQty = snap(running);
    const closingQty = snap(running);

    // s EX 54 factors: walk the in-year events backwards multiplying split ratios.
    const inYear = events.filter((e) => e.date >= start);
    let f = ONE;
    for (let i = inYear.length - 1; i >= 0; i--) {
      const e = inYear[i]!;
      e.factorToEnd = f;
      if (e.ratio) f = f.times(e.ratio);
    }
    const hasReorg = inYear.some((e) => e.txn.type === 'SPLIT');
    const openingEq = openingQty.times(f);
    let peakEq = openingEq;
    let peakDate = start;
    for (const e of inYear) {
      const eq = e.after.times(e.factorToEnd);
      if (eq.gt(peakEq)) { peakEq = eq; peakDate = e.date; }
    }
    out.set(key, {
      key,
      symbol: list[0]!.t.symbol,
      exchange: list[0]!.t.exchange,
      name,
      currency,
      assetClass: list[0]!.t.assetClass,
      accounts: [...accounts].sort(),
      sources: [...sources].sort(),
      openingQty,
      closingQty,
      openingEq,
      peakEq,
      peakDate,
      hasReorg,
      events,
      inYear,
      dividends,
      flags: [...flags].sort(),
    });
  }
  return out;
}

function snap(d: Decimal): Decimal {
  return isZeroQty(d) ? ZERO : d;
}

/** Holdings that matter for the year: held at either end, or any in-year activity. */
export function isRelevant(p: Position): boolean {
  return !p.openingQty.isZero() || !p.closingQty.isZero() || p.inYear.length > 0 || p.dividends.length > 0;
}
