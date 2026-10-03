// Sharesies transaction-report CSV (PLAN §0/§4).
// Quirks: mixed UTC timestamp formats; `Amount` = qty x price with the fee in
// its own column; quantities to 8 dp; "Initiated by = System" rows fall on
// dividend dates (probably DRP reinvestments, flagged); no splits.
import { dec, decOr0, s } from '../decimal';
import { TZ_AUCKLAND, parseUtcStamp, zonedDate } from '../dates';
import { canonicalExchange, canonicalSymbol, instrumentKey } from '../markets';
import type { ParseResult, Txn } from '../types';
import { cellStr, findHeaderRow, indexHeader, type Rows } from './tabular';
import { exchangeTimeZone, inferAssetClass } from './common';

export const SHARESIES_HEADER = ['Trade ID', 'Trade date', 'Instrument code', 'Market code', 'Quantity', 'Price', 'Transaction type', 'Amount', 'Transaction fee'];

export function parseSharesies(rows: Rows, fileName: string): ParseResult {
  const warnings: string[] = [];
  const h = findHeaderRow(rows, SHARESIES_HEADER);
  if (h < 0) throw new Error(`${fileName}: not a Sharesies transaction report (header not found)`);
  const col = indexHeader(rows[h]!);
  const get = (r: Rows[number], name: string) => cellStr(r[col.get(name.toLowerCase()) ?? -1]);
  const txns: Txn[] = [];
  const stats: Record<string, number> = { rows: 0, buy: 0, sell: 0, drpLikely: 0, amountMismatch: 0, sameNzAndExchangeDate: 0 };

  rows.slice(h + 1).forEach((r, i) => {
    const tradeId = get(r, 'Trade ID');
    if (!tradeId && !get(r, 'Instrument code')) return;
    stats.rows!++;
    const rowRef = `${fileName}#${h + 2 + i}`;
    const typeRaw = get(r, 'Transaction type').toUpperCase();
    const flags: string[] = [];
    const ts = parseUtcStamp(get(r, 'Trade date'));
    if (!ts) { warnings.push(`${rowRef}: unreadable Trade date "${get(r, 'Trade date')}", row skipped`); return; }
    const exchange = canonicalExchange(get(r, 'Market code'));
    const symbol = canonicalSymbol(get(r, 'Instrument code'));
    const qtyAbs = decOr0(get(r, 'Quantity')).abs();
    const price = dec(get(r, 'Price'));
    const amount = decOr0(get(r, 'Amount')).abs();
    const fee = decOr0(get(r, 'Transaction fee')).abs();
    const currency = get(r, 'Currency').toUpperCase() || 'USD';
    let type: Txn['type'];
    if (typeRaw === 'BUY') {
      type = get(r, 'Initiated by').toLowerCase() === 'system' ? 'DRP' : 'BUY';
      if (type === 'DRP') { flags.push('drp_inferred_from_initiated_by_system'); stats.drpLikely!++; }
      stats.buy!++;
    } else if (typeRaw === 'SELL') {
      type = 'SELL';
      stats.sell!++;
    } else {
      warnings.push(`${rowRef}: unknown Transaction type "${typeRaw}", row skipped`);
      return;
    }
    if (price) {
      const gross = qtyAbs.times(price);
      if (gross.minus(amount).abs().gt('0.01')) { flags.push('amount_differs_from_qty_x_price'); stats.amountMismatch!++; }
    }
    const sign = type === 'SELL' ? -1 : 1;
    const cash = type === 'SELL' ? amount.minus(fee) : amount.plus(fee).neg();
    const exchangeDate = zonedDate(ts, exchangeTimeZone(exchange));
    const nzDate = zonedDate(ts, TZ_AUCKLAND);
    if (exchangeDate === nzDate) stats.sameNzAndExchangeDate!++;
    const name = get(r, 'Instrument name');
    txns.push({
      id: `sharesies:${tradeId || rowRef}`,
      source: 'sharesies',
      sourceRef: tradeId || rowRef,
      account: `sharesies:${get(r, 'Portfolio') || 'default'}`,
      instrumentKey: instrumentKey(symbol, exchange),
      symbol,
      exchange,
      name,
      assetClass: inferAssetClass(symbol, exchange, name),
      type,
      tsUtc: ts.toISOString(),
      exchangeDate,
      nzDate,
      qty: s(sign < 0 ? qtyAbs.neg() : qtyAbs),
      price: price ? s(price) : '',
      currency,
      fee: s(fee),
      feeCcy: currency,
      cashAmount: s(cash),
      fxSource: 'none',
      provenance: [`sharesies:${tradeId || rowRef}`],
      flags,
    });
  });
  stats.trades = txns.length;
  return { kind: 'sharesies', fileName, txns, warnings, stats };
}

