// Report tables shaped like Sharesight's FIF report sections (PLAN §8). Column
// names are provisional until checked against a real Sharesight export.
import { Decimal, money2 } from './decimal';
import type { PortfolioResult } from './fif';
import type { CashFundComparison } from './cashFunds';
import type { HoldingAssumption } from './assumptions';

export const REPORT_DISCLAIMER =
  'Not tax advice. nz-fif is a calculation aid that applies published IRD FIF methods (IR461, April 2026; Income Tax Act 2007 subpart EX). ' +
  'It does not decide your tax residence, whether an interest is a FIF, whether an exemption applies, or which method you must use. ' +
  'Check the figures against your broker records and confirm with IRD or a tax adviser before filing.';

export interface Table {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

const q = (d: Decimal | null | undefined, dp = 6) => (d === null || d === undefined ? '' : d.toDecimalPlaces(dp).toString());
const m = (d: Decimal | null | undefined) => (d === null || d === undefined ? '' : money2(d));

export function summaryTable(r: PortfolioResult, cash?: CashFundComparison | null): Table {
  const t = r.totals;
  const rows: string[][] = [];
  if (t) {
    rows.push(['FDR', 'Foreign Investment Fund Income', m(t.fdr)]);
    rows.push(['FDR', '  of which 5% of opening value', m(t.fdrBase)]);
    rows.push(['FDR', '  of which quick sale adjustment', m(t.qsa)]);
    rows.push(['FDR', 'Exempt Overseas Income (dividends replaced by FDR)', m(t.dividendsGrossNzd)]);
    rows.push(['FDR', 'Total (Claimable) Overseas Tax Paid', m(t.ftcFdr)]);
    rows.push(['CV', 'Foreign Investment Fund Income', m(t.cv)]);
    if (t.cvFloored) rows.push(['CV', '  (portfolio CV was negative and is reduced to zero)', m(t.cvRaw)]);
    rows.push(['CV', 'Total (Claimable) Overseas Tax Paid', m(t.ftcCv)]);
    rows.push(['Choice', 'Lower method (if you may choose; IR461 p.14)', t.lower]);
    if (cash && cash.funds.length) {
      rows.push(['With cash funds', `FDR total incl. cash funds (${cash.treatment === 'cv' ? 'cash funds on CV' : 'same method'})`, m(t.fdr.plus(cash.addToFdr))]);
      rows.push(['With cash funds', 'CV total incl. cash funds', m(Decimal.max(0, t.cvRaw.plus(cash.addToCv)))]);
    }
  }
  return { id: 'summary', title: 'Income summary', columns: ['Method', 'Item', 'NZD'], rows };
}

export function fdrTable(r: PortfolioResult): Table {
  return {
    id: 'fdr', title: 'FDR report',
    columns: ['Holding', 'Market', 'Opening qty', 'Opening price', 'FX (NZD per unit)', 'Opening value NZD', '5% FDR', 'Peak (equiv.) qty', 'Peak date', 'Closing qty', 'Peak differential', 'Average cost NZD', 'Peak holding amount', 'Quick sale gain', 'QSA (allocated)', 'FDR income'],
    rows: r.holdings.filter((h) => h.included).map((h) => [
      h.symbol, h.exchange, q(h.opening.qty), q(h.opening.price), q(h.opening.nzdPerUnit), m(h.opening.mvNzd), m(h.fdrBase), q(h.peakEq), h.peakDate, q(h.closing.qty),
      q(h.peakDifferential), m(h.averageCost), m(h.peakAmount), m(h.qsGain), m(h.qsa), m(h.fdrIncome),
    ]),
    note: 'QSA = lesser of the TOTAL peak holding amount and the TOTAL quick sale gain (s EX 52(7)); shown per holding pro rata to the peak holding amount.',
  };
}

export function quickSaleTable(r: PortfolioResult): Table {
  const rows: string[][] = [];
  for (const h of r.holdings.filter((x) => x.included)) {
    for (const g of h.qsGainRows) rows.push([h.symbol, g.disposalDate, g.acquisitionDate, q(g.units), q(g.equivalentUnits), m(g.proceedsNzd), m(g.costNzd), m(g.gainNzd)]);
  }
  return {
    id: 'quick-sale', title: `Quick sale gains (${r.options.qsGainOrder.toUpperCase()}, ${r.options.qsGainCost === 'average' ? 'year-average cost' : 'lot cost'})`,
    columns: ['Holding', 'Disposal date', 'Matched acquisition', 'Units', 'Equivalent units', 'Proceeds NZD', 'Cost NZD', 'Gain NZD'], rows,
  };
}

export function cvTable(r: PortfolioResult): Table {
  return {
    id: 'cv', title: 'CV report',
    columns: ['Holding', 'Market', 'Opening value NZD', 'Purchases NZD', 'Sales NZD', 'Dividends (gross) NZD', 'Closing value NZD', 'CV income NZD'],
    rows: r.holdings.filter((h) => h.included).map((h) => [
      h.symbol, h.exchange, m(h.opening.mvNzd), m(h.acquisitionsNzd), m(h.disposalsNzd), r.options.includeDividends ? m(h.dividendsGrossNzd) : 'excluded', m(h.closing.mvNzd), m(h.cvIncome),
    ]),
  };
}

export function taxCreditTable(r: PortfolioResult): Table {
  return {
    id: 'tax', title: 'FIF dividends and foreign tax credits',
    columns: ['Holding', 'Gross dividends NZD', 'Withholding NZD', 'Claimable (FDR)', 'Claimable (CV)'],
    rows: r.holdings.filter((h) => h.included && !h.withholdingNzd.isZero()).map((h) => [h.symbol, m(h.dividendsGrossNzd), m(h.withholdingNzd), m(h.ftcFdr), m(h.ftcCv)]),
    note: `Credit per holding = lesser of the withholding and NZ tax at ${r.options.marginalRate} on that holding's FIF income; not refundable or carried forward (IR461 p.20).`,
  };
}

export function deMinimisTable(r: PortfolioResult): Table {
  const d = r.deMinimis;
  return {
    id: 'threshold', title: 'NZ$50,000 threshold (cost, FIFO)',
    columns: ['Item', 'Value'],
    rows: [
      ['Cost of FIF interests at start of year (NZD)', m(d.openingCostNzd)],
      ['Peak cost during the year (NZD)', m(d.peakCostNzd)],
      ['Date of peak', d.peakDate],
      ['Over NZ$50,000 at any time?', d.exceeds ? 'Yes: FIF rules apply' : 'No: FIF rules need not apply (natural persons; IR461 p.9)'],
      ...(d.costIncomplete ? [['Warning', 'Some purchase costs could not be determined; the cost test may be understated.']] : []),
    ],
  };
}

export function assumptionsTable(r: PortfolioResult, holdings: HoldingAssumption[], extra: Array<[string, string]>): Table {
  return {
    id: 'assumptions', title: 'Assumptions',
    columns: ['Item', 'Choice', 'Basis', 'Reason'],
    rows: [
      ...holdings.map((h) => [h.key, h.fifClass, h.source === 'user' ? 'your choice' : `rule: ${h.rule}`, h.reason + (h.note ? ` (${h.note})` : '')]),
      ['Date basis', r.options.dateBasis, 'setting', r.options.dateBasis === 'exchange' ? 'Trade date on the exchange (matches Sharesight)' : 'Trade date in New Zealand'],
      ['FX', r.options.fxMode, 'setting', r.fxNotes.join(' ')],
      ['Quick sale gain cost', r.options.qsGainCost, 'setting', r.options.qsGainCost === 'average' ? 'Year-average cost, LIFO (s EX 52(12),(13))' : 'Each matched acquisition\'s own cost (Sharesight-style)'],
      ['Dividends in CV', String(r.options.includeDividends), 'setting', ''],
      ...extra.map(([k, v]) => [k, v, 'setting', '']),
    ],
  };
}

/** IR3 boxes 17A/17B for the chosen method (IR3G 2026 p.21-23). FIF income only. */
export function ir3Table(r: PortfolioResult, method: 'FDR' | 'CV', cash?: CashFundComparison | null): Table {
  const t = r.totals;
  if (!t) return { id: 'ir3', title: 'IR3 boxes', columns: ['Box', 'Amount'], rows: [] };
  const income = method === 'FDR' ? t.fdr.plus(cash?.addToFdr ?? 0) : Decimal.max(0, t.cvRaw.plus(cash?.addToCv ?? 0));
  const credits = method === 'FDR' ? t.ftcFdr : t.ftcCv;
  return {
    id: 'ir3', title: `IR3 boxes (${method})`, columns: ['Box', 'Amount'],
    rows: [['17B Gross overseas income (FIF income)', m(income)], ['17A Overseas tax paid (claimable credits)', m(credits)]],
    note: 'FIF income only. Add any other overseas income (e.g. dividends from non-FIF shares, interest) and its tax yourself. List each FIF on the IR1261.',
  };
}

export function allTables(r: PortfolioResult, holdings: HoldingAssumption[], extra: Array<[string, string]>, cash?: CashFundComparison | null): Table[] {
  const method = r.totals?.lower === 'CV' ? 'CV' : 'FDR';
  return [summaryTable(r, cash), deMinimisTable(r), fdrTable(r), quickSaleTable(r), cvTable(r), taxCreditTable(r), assumptionsTable(r, holdings, extra), ir3Table(r, method, cash)];
}

function csvCell(s: string): string {
  // Neutralise spreadsheet formula injection and quote as needed.
  const v = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function tableToCsv(t: Table): string {
  return [t.columns, ...t.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Full-precision JSON (Decimals as strings). */
export function resultToJson(r: PortfolioResult, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ disclaimer: REPORT_DISCLAIMER, ...extra, result: r }, (_k, v: unknown) => (v instanceof Decimal ? v.toString() : v), 2) + '\n';
}
