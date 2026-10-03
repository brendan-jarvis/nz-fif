// Hatch transaction CSV (PLAN §0/§4).
// Quirks: day-first NZ dates; the exchange (US) date is the NZ date − 1;
// fees are inside `Amount`; `Amount` sometimes differs from qty x price ± fee
// (we keep qty x price ± fee, as Sharesight does, and flag the difference);
// dividends are NET of withholding; DAGXX / "Money market fund" rows are a
// cash fund; cancelled orders are dropped.
import { Decimal, ONE, decOr0, s } from '../decimal';
import { addDays, dmyToIso } from '../dates';
import { canonicalSymbol, instrumentKey } from '../markets';
import type { ParseResult, Txn } from '../types';
import { cellStr, findHeaderRow, indexHeader, type Rows } from './tabular';
import { MMF_TICKERS, inferAssetClass } from './common';

export const HATCH_HEADER = ['Date', 'Transaction type', 'Symbol', 'Description', 'Amount (USD)', 'Order fill price', 'Order share quantity', 'Order fee'];

export interface HatchOptions {
  /** Assumed US withholding rate on Hatch's net dividends (default 15 %, flagged). */
  dividendGrossUpRate?: string;
}

export function parseHatch(rows: Rows, fileName: string, opts: HatchOptions = {}): ParseResult {
  const rate = new Decimal(opts.dividendGrossUpRate ?? '0.15');
  const warnings: string[] = [];
  const h = findHeaderRow(rows, HATCH_HEADER);
  if (h < 0) throw new Error(`${fileName}: not a Hatch transaction export (header not found)`);
  const col = indexHeader(rows[h]!);
  const get = (r: Rows[number], name: string) => cellStr(r[col.get(name.toLowerCase()) ?? -1]);
  const txns: Txn[] = [];
  const stats: Record<string, number> = { rows: 0, buy: 0, sell: 0, cancelled: 0, dividend: 0, interest: 0, deposit: 0, other: 0, amountMismatch: 0 };

  rows.slice(h + 1).forEach((r, i) => {
    const rowRef = `${fileName}#${h + 2 + i}`;
    const typeRaw = get(r, 'Transaction type');
    if (!typeRaw) return;
    stats.rows!++;
    const nzDate = dmyToIso(get(r, 'Date'));
    if (!nzDate) { warnings.push(`${rowRef}: unreadable Date "${get(r, 'Date')}", row skipped`); return; }
    const symbol = canonicalSymbol(get(r, 'Symbol'));
    const name = get(r, 'Investment name');
    const description = get(r, 'Description');
    const amount = decOr0(get(r, 'Amount (USD)'));
    const base = {
      source: 'hatch' as const,
      sourceRef: rowRef,
      account: 'hatch:default',
      symbol,
      name,
      currency: 'USD',
      feeCcy: 'USD',
      fxSource: 'none' as const,
      provenance: [`hatch:${rowRef}`],
    };
    const t = typeRaw.toLowerCase();

    if (t.startsWith('cancelled order')) { stats.cancelled!++; return; }

    if (t === 'order - buy' || t === 'order - sell') {
      const isSell = t === 'order - sell';
      const qtyAbs = decOr0(get(r, 'Order share quantity')).abs();
      const price = decOr0(get(r, 'Order fill price'));
      const fee = decOr0(get(r, 'Order fee')).abs();
      const gross = qtyAbs.times(price);
      const expected = isSell ? gross.minus(fee) : gross.plus(fee).neg();
      const flags = ['exchange_date_inferred_nz_minus_1'];
      if (expected.minus(amount).abs().gt('0.005')) {
        flags.push(`hatch_amount_differs:${s(amount)}_vs_${s(expected)}`);
        stats.amountMismatch!++;
      }
      if (isSell) stats.sell!++;
      else stats.buy!++;
      txns.push({
        ...base,
        id: `hatch:${rowRef}`,
        exchange: 'US',
        instrumentKey: instrumentKey(symbol, 'US'),
        assetClass: inferAssetClass(symbol, 'US', name, description),
        type: isSell ? 'SELL' : 'BUY',
        exchangeDate: addDays(nzDate, -1),
        nzDate,
        qty: s(isSell ? qtyAbs.neg() : qtyAbs),
        price: s(price),
        fee: s(fee),
        cashAmount: s(expected),
        flags,
      });
      return;
    }

    if (t === 'dividend') {
      stats.dividend!++;
      const isMmf = MMF_TICKERS.has(symbol) || /money market/i.test(description);
      const flags: string[] = [];
      let gross = amount;
      let wht = new Decimal(0);
      let grossUpRate: string | undefined;
      if (isMmf) {
        flags.push('mmf_dividend_withholding_unknown_assumed_nil');
      } else if (amount.gt(0)) {
        gross = amount.div(ONE.minus(rate));
        wht = gross.minus(amount);
        grossUpRate = s(rate);
        flags.push(`hatch_net_dividend_grossed_up_${s(rate.times(100))}pct_inferred`);
      }
      const unassigned = !symbol;
      if (unassigned) flags.push('unassigned_dividend_no_symbol');
      const perShare = /\$([\d.]+) a share/i.exec(description)?.[1];
      const sym = symbol || (isMmf ? 'DAGXX' : '');
      txns.push({
        ...base,
        symbol: sym,
        id: `hatch:${rowRef}`,
        exchange: 'US',
        instrumentKey: unassigned && !isMmf ? 'UNASSIGNED:HATCH' : instrumentKey(sym, 'US'),
        assetClass: isMmf ? 'cash_mmf' : unassigned ? 'other' : inferAssetClass(sym, 'US', name, description),
        type: 'DIVIDEND',
        exchangeDate: addDays(nzDate, -1),
        nzDate,
        qty: '0',
        price: '',
        fee: '0',
        cashAmount: s(amount),
        dividend: { gross: s(gross), wht: s(wht), net: s(amount), ...(grossUpRate ? { grossUpRate } : {}), ...(perShare ? { perShare } : {}) },
        flags: [...flags, `description:${description}`],
      });
      return;
    }

    const isInterest = t.startsWith('interest');
    const isDeposit = t === 'deposit' || t === 'withdrawal';
    if (isInterest) stats.interest!++;
    else if (isDeposit) stats.deposit!++;
    else stats.other!++;
    if (!isInterest && !isDeposit) warnings.push(`${rowRef}: unrecognised Hatch type "${typeRaw}" kept as cash movement`);
    txns.push({
      ...base,
      symbol: '',
      id: `hatch:${rowRef}`,
      exchange: '',
      instrumentKey: 'CASH:HATCH',
      assetClass: 'cash_mmf',
      type: isInterest ? 'INTEREST' : 'CASH',
      exchangeDate: addDays(nzDate, -1),
      nzDate,
      qty: '0',
      price: '',
      fee: '0',
      cashAmount: s(amount),
      flags: [`description:${description}`, ...(isInterest || isDeposit ? [] : [`unrecognised_type:${typeRaw}`])],
    });
  });
  stats.orders = stats.buy! + stats.sell!;
  return { kind: 'hatch', fileName, txns, warnings, stats };
}

