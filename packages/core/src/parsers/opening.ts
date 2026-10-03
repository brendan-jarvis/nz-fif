// Opening holdings CSV (PLAN §6.1): for users without a full-history All Trades export.
// Columns (header names case-insensitive): Symbol, Market, Quantity, As at (YYYY-MM-DD or
// DD/MM/YYYY), and optionally Name, Currency, Cost NZD (total cost, used only for the
// NZ$50,000 cost test). Each row becomes an OPENING transaction on the "As at" date.
import { dec, s } from '../decimal';
import { dmyToIso, isIsoDate } from '../dates';
import { canonicalExchange, canonicalSymbol, instrumentKey } from '../markets';
import type { ParseResult, Txn } from '../types';
import { cellStr, findHeaderRow, indexHeader, type Rows } from './tabular';
import { inferAssetClass } from './common';

export const OPENING_HEADER = ['Symbol', 'Market', 'Quantity', 'As at'];

export function parseOpening(rows: Rows, fileName: string): ParseResult {
  const h = findHeaderRow(rows, OPENING_HEADER);
  if (h < 0) throw new Error(`${fileName}: not an opening-holdings CSV`);
  const col = indexHeader(rows[h]!);
  const get = (r: Rows[number], name: string) => cellStr(r[col.get(name.toLowerCase()) ?? -1]);
  const txns: Txn[] = [];
  const warnings: string[] = ['Opening holdings from a CSV: do not also load a full-history All Trades export for the same holdings, or they will be counted twice.'];
  const stats: Record<string, number> = { rows: 0, withCost: 0 };
  rows.slice(h + 1).forEach((r, i) => {
    const rowRef = `${fileName}#${h + 2 + i}`;
    const sym = get(r, 'Symbol');
    if (!sym) return;
    const qty = dec(get(r, 'Quantity'));
    const rawDate = get(r, 'As at');
    const date = isIsoDate(rawDate) ? rawDate : dmyToIso(rawDate);
    if (!qty || !date) { warnings.push(`${rowRef}: needs a numeric Quantity and an As at date; row skipped`); return; }
    stats.rows!++;
    const exchange = canonicalExchange(get(r, 'Market'));
    const symbol = canonicalSymbol(sym);
    const name = get(r, 'Name');
    const cost = dec(get(r, 'Cost NZD'));
    if (cost) stats.withCost!++;
    txns.push({
      id: `opening:${rowRef}`, source: 'manual', sourceRef: rowRef, account: 'manual:opening', instrumentKey: instrumentKey(symbol, exchange),
      symbol, exchange, name, assetClass: inferAssetClass(symbol, exchange, name), type: 'OPENING', exchangeDate: date, nzDate: date,
      qty: s(qty), price: '', currency: get(r, 'Currency').toUpperCase() || 'USD', fee: '0', feeCcy: '', cashAmount: '0',
      fxSource: 'none', ...(cost ? { nzdValue: s(cost.abs()) } : {}), provenance: [rowRef], flags: cost ? [] : ['opening_cost_unknown'],
    });
  });
  return { kind: 'opening', fileName, txns, warnings, stats };
}
