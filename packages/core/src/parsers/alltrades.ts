// Sharesight "All Trades" report, xlsx or csv (PLAN §0/§4).
// Quirks: title rows above the header (row 3 on Combined, row 4 on market
// sheets); one `Combined` sheet plus one sheet per market repeating the same
// rows; a `Total` row at the end; signed Qty; `Exch. Rate` = instrument
// currency per 1 NZD; `Value` = NZD (+ buys, − sells); dates are the
// exchange-local date; `Cost Base Per Share (nzd)` is always empty.
import { dec, decOr0, s } from '../decimal';
import { addDays, isIsoDate } from '../dates';
import { canonicalExchange, canonicalSymbol, instrumentKey, isUsExchange } from '../markets';
import type { ParseResult, Txn, TxnType } from '../types';
import { cellStr, findHeaderRow, indexHeader, type Rows } from './tabular';
import { excelSerialToIso, inferAssetClass } from './common';

export const ALLTRADES_HEADER = ['Code', 'Market Code', 'Date', 'Type', 'Qty', 'Exch. Rate', 'Value'];

const TYPE_MAP: Record<string, { type: TxnType; flag?: string }> = {
  buy: { type: 'BUY' },
  sell: { type: 'SELL' },
  reinvestment: { type: 'DRP' },
  split: { type: 'SPLIT' },
  consolidation: { type: 'SPLIT', flag: 'consolidation' },
  'opening balance': { type: 'OPENING' },
  'merge buy': { type: 'BUY', flag: 'corporate_action_merge_buy' },
  'merge (cancel)': { type: 'SELL', flag: 'corporate_action_merge_cancel' },
  'return of capital': { type: 'CASH', flag: 'return_of_capital_not_modelled' },
};

/** Pick the sheet to read: `Combined` if present (market sheets repeat its rows). */
export function pickAllTradesSheet(sheets: Map<string, Rows>): { name: string; rows: Rows } | null {
  const combined = [...sheets.entries()].find(([n]) => n.trim().toLowerCase() === 'combined');
  if (combined) return { name: combined[0], rows: combined[1] };
  for (const [name, rows] of sheets) if (findHeaderRow(rows, ALLTRADES_HEADER) >= 0) return { name, rows };
  return null;
}

export function parseAllTrades(rows: Rows, fileName: string): ParseResult {
  const warnings: string[] = [];
  const h = findHeaderRow(rows, ALLTRADES_HEADER);
  if (h < 0) throw new Error(`${fileName}: not a Sharesight All Trades report (header not found)`);
  const col = indexHeader(rows[h]!);
  const raw = (r: Rows[number], name: string) => r[col.get(name.toLowerCase()) ?? -1];
  const get = (r: Rows[number], name: string) => cellStr(raw(r, name));
  const txns: Txn[] = [];
  const stats: Record<string, number> = { rows: 0, totalRows: 0, crypto: 0, other: 0 };

  rows.slice(h + 1).forEach((r, i) => {
    const code = get(r, 'Code');
    if (!code) return;
    if (code.toLowerCase() === 'total') { stats.totalRows!++; return; }
    const rowRef = `${fileName}#${h + 2 + i}`;
    const dateCell = raw(r, 'Date');
    const exchangeDate = typeof dateCell === 'number' ? excelSerialToIso(dateCell) : cellStr(dateCell).slice(0, 10);
    if (!isIsoDate(exchangeDate)) { warnings.push(`${rowRef}: unreadable Date "${cellStr(dateCell)}", row skipped`); return; }
    const typeRaw = get(r, 'Type');
    const mapped = TYPE_MAP[typeRaw.toLowerCase()];
    if (!mapped) { warnings.push(`${rowRef}: unknown Type "${typeRaw}", row skipped`); return; }
    stats.rows!++;
    const key = `type_${mapped.type}`;
    stats[key] = (stats[key] ?? 0) + 1;
    const exchange = canonicalExchange(get(r, 'Market Code'));
    const symbol = canonicalSymbol(code);
    const name = get(r, 'Name');
    const assetClass = inferAssetClass(symbol, exchange, name);
    if (exchange === 'CRYPTO') stats.crypto!++;
    if (exchange === 'OTHER') stats.other!++;
    const qty = decOr0(raw(r, 'Qty'));
    const price = dec(raw(r, 'Price'));
    const currency = get(r, 'Instrument Currency').toUpperCase();
    const fee = decOr0(raw(r, 'Brokerage')).abs();
    const feeCcy = get(r, 'Brokerage Currency').toUpperCase() || currency;
    const fx = dec(raw(r, 'Exch. Rate'));
    const value = dec(raw(r, 'Value'));
    const flags = mapped.flag ? [mapped.flag] : [];
    let cash = '0';
    if (price && (mapped.type === 'BUY' || mapped.type === 'SELL' || mapped.type === 'DRP')) {
      const gross = qty.abs().times(price);
      const feeInCcy = feeCcy === currency ? fee : decOr0(0);
      cash = s(mapped.type === 'SELL' ? gross.minus(feeInCcy) : gross.plus(feeInCcy).neg());
      if (feeCcy !== currency && fee.gt(0)) flags.push(`fee_in_other_currency:${feeCcy}`);
    }
    const us = isUsExchange(exchange);
    if (us) flags.push('nz_date_inferred_exchange_plus_1');
    txns.push({
      id: `sharesight:${rowRef}`,
      source: 'sharesight',
      sourceRef: rowRef,
      account: 'sharesight:portfolio',
      instrumentKey: instrumentKey(symbol, exchange),
      symbol,
      exchange,
      name,
      assetClass,
      type: mapped.type,
      exchangeDate,
      // A US trade on date D settles in NZ on D+1 for a regular session; pre-market
      // fills can fall on D in NZ. Broker CSVs carry the exact NZ date after merge.
      nzDate: us ? addDays(exchangeDate, 1) : exchangeDate,
      qty: s(qty),
      price: price ? s(price) : '',
      currency,
      fee: s(fee),
      feeCcy,
      cashAmount: cash,
      ...(fx ? { fxForeignPerNzd: s(fx) } : {}),
      fxSource: fx ? 'sharesight_trade' : 'none',
      ...(value ? { nzdValue: s(value) } : {}),
      provenance: [`sharesight:${rowRef}`],
      flags,
    });
  });
  stats.parsed = txns.length;
  return { kind: 'alltrades', fileName, txns, warnings, stats };
}
