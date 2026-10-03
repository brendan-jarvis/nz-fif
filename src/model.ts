// Pure helpers that turn parsed transactions + user choices into engine inputs.
import {
  addDays, buildLedger, calculate, cashFund, compareCashFunds, incomeYear, isRelevant, suggestClass, yahooSymbol,
  type Assumptions, type CalcOptions, type CashFundComparison, type FifClass, type FxTable, type HoldingAssumption,
  type PortfolioResult, type Position, type PriceInput, type Txn,
} from '@nz-fif/core';
import type { PriceNeed } from './components/PricePanel';

export type Prices = Record<string, { opening?: PriceInput; closing?: PriceInput }>;
export type Cash = Assumptions['cashFunds'];

export function incomeYearOf(date: string): number {
  const y = Number(date.slice(0, 4));
  return date.slice(5) >= '04-01' ? y + 1 : y;
}

export function availableYears(txns: Txn[], today: string): { years: number[]; preferred: number } {
  const ys = new Set<number>();
  for (const t of txns) if (t.exchangeDate) ys.add(incomeYearOf(t.exchangeDate));
  const years = [...ys].sort((a, b) => b - a);
  const done = years.filter((y) => incomeYear(y).end < today);
  return { years: years.length ? years : [incomeYearOf(today) - 1], preferred: done[0] ?? years[0] ?? incomeYearOf(today) - 1 };
}

export function applyAssignments(txns: Txn[], cash: Cash): Txn[] {
  const a = cash.dividendAssignments;
  if (!Object.keys(a).length) return txns;
  return txns.map((t) => {
    const k = a[t.id];
    if (!k || t.type !== 'DIVIDEND') return t;
    const [symbol, exchange] = k.split(':');
    return { ...t, instrumentKey: k, symbol: symbol ?? t.symbol, exchange: exchange ?? t.exchange, flags: [...t.flags, 'dividend_assigned_by_user'] };
  });
}

export function positionsFor(txns: Txn[], year: number, opts: CalcOptions): Position[] {
  return [...buildLedger(txns, { year, dateBasis: opts.dateBasis }).values()].filter(isRelevant).sort((a, b) => a.key.localeCompare(b.key));
}

export function suggestionFor(p: Position): HoldingAssumption {
  const s = suggestClass(p);
  return { key: p.key, fifClass: s.fifClass, source: 'rule', rule: s.rule, reason: s.caution ? `${s.reason} ${s.caution}` : s.reason, yahooSymbol: yahooSymbol(p.symbol, p.exchange) };
}

export function priceNeeds(positions: Position[], holdings: Record<string, HoldingAssumption>, year: number): PriceNeed[] {
  const { start, end } = incomeYear(year);
  const out: PriceNeed[] = [];
  for (const p of positions) {
    const h = holdings[p.key];
    if (h?.fifClass !== 'fif') continue;
    const base = { key: p.key, symbol: p.symbol, yahooSymbol: h.yahooSymbol || yahooSymbol(p.symbol, p.exchange), currency: p.currency };
    if (!p.openingQty.isZero()) out.push({ ...base, which: 'opening', date: addDays(start, -1), qty: p.openingQty.toString() });
    if (!p.closingQty.isZero()) out.push({ ...base, which: 'closing', date: end, qty: p.closingQty.toString() });
  }
  return out;
}

export function runCalc(txns: Txn[], year: number, opts: CalcOptions, holdings: Record<string, HoldingAssumption>, prices: Prices, fx: FxTable): PortfolioResult {
  const classes: Record<string, FifClass> = {};
  for (const [k, h] of Object.entries(holdings)) classes[k] = h.fifClass === 'excluded' && h.source === 'user' && !h.note?.trim() ? 'review' : h.fifClass; // your exclusions need a reason
  return calculate({ txns, year, classes, prices, fx, options: opts });
}

export function cashComparison(txns: Txn[], positions: Position[], holdings: Record<string, HoldingAssumption>, cash: Cash, year: number, fx: FxTable): { keys: string[]; cmp: CashFundComparison } {
  const keys = positions.filter((p) => holdings[p.key]?.fifClass === 'cash_mmf').map((p) => p.key);
  const funds = keys.map((k) => {
    const p = positions.find((x) => x.key === k)!;
    const b = cash.balances[k] ?? { openingBalance: '0', closingBalance: '0' };
    return cashFund({ key: k, currency: p.currency || 'USD', ...b }, p.dividends, year, fx);
  });
  void txns;
  return { keys, cmp: compareCashFunds(funds, cash.treatment) };
}
