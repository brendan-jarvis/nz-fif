// Cash / money market funds (PLAN §5). Excluded by default as a USER ASSUMPTION;
// when included, either CV only (default; consistent with IRD determinations that
// such funds may not use FDR) or the same method as the rest of the portfolio.
import { Decimal, ZERO, ONE, sum } from './decimal';
import { addDays, incomeYear } from './dates';
import type { FxTable } from './fx';
import type { Txn } from './types';

export interface CashFundInput {
  key: string;
  currency: string;
  /** Balance (units at NAV 1.00) at 1 April and 31 March. */
  openingBalance: string;
  closingBalance: string;
  /** If the fund was fully withdrawn during the year. */
  exitDate?: string;
}

export interface CashFundResult {
  key: string;
  openingNzd: Decimal;
  closingNzd: Decimal;
  exitProceedsNzd: Decimal;
  dividendsGrossNzd: Decimal;
  withholdingNzd: Decimal;
  cv: Decimal;
  fdr: Decimal;
  flags: string[];
}

export function cashFund(input: CashFundInput, dividends: Txn[], year: number, fx: FxTable): CashFundResult {
  const { start, end } = incomeYear(year);
  const flags = ['cash_fund_cv_approximation_ignores_deposits_and_withdrawals'];
  const rate = (d: string) => (input.currency === 'NZD' ? ONE : fx.nzdPerUnit(input.currency, d));
  const rOpen = rate(addDays(start, -1)), rClose = rate(end);
  if (!rOpen || !rClose) flags.push('fx_missing');
  const open = new Decimal(input.openingBalance || '0').times(rOpen ?? ZERO);
  const close = new Decimal(input.closingBalance || '0').times(rClose ?? ZERO);
  let exit = ZERO;
  if (input.exitDate) {
    const r = rate(input.exitDate);
    exit = new Decimal(input.openingBalance || '0').times(r ?? ZERO);
    flags.push('cash_fund_exit_treated_as_withdrawal_of_opening_balance');
  }
  let gross = ZERO, wht = ZERO;
  for (const d of dividends) {
    if (!d.dividend) continue;
    const r = rate(d.nzDate) ?? ZERO;
    gross = gross.plus(new Decimal(d.dividend.gross).times(r));
    wht = wht.plus(new Decimal(d.dividend.wht).times(r));
  }
  const cv = close.plus(exit).plus(gross).minus(open);
  return { key: input.key, openingNzd: open, closingNzd: close, exitProceedsNzd: exit, dividendsGrossNzd: gross, withholdingNzd: wht, cv, fdr: new Decimal('0.05').times(open), flags };
}

export interface CashFundComparison {
  treatment: 'cv' | 'same';
  funds: CashFundResult[];
  /** Amounts to ADD to the portfolio's FDR and CV totals when cash funds are included. */
  addToFdr: Decimal;
  addToCv: Decimal;
}

export function compareCashFunds(funds: CashFundResult[], treatment: 'cv' | 'same'): CashFundComparison {
  const cvSum = sum(funds.map((f) => f.cv));
  if (treatment === 'cv') return { treatment, funds, addToFdr: cvSum, addToCv: cvSum }; // CV-only pool applies under either method
  return { treatment, funds, addToFdr: sum(funds.map((f) => f.fdr)), addToCv: cvSum };
}
