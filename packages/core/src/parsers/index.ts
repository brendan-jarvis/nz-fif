import type { FileKind, ParseResult } from '../types';
import { ALLTRADES_HEADER, parseAllTrades, pickAllTradesSheet } from './alltrades';
import { HATCH_HEADER, parseHatch, type HatchOptions } from './hatch';
import { SHARESIES_HEADER, parseSharesies } from './sharesies';
import { csvRows, decodeText, findHeaderRow, isZip, xlsxSheets, type Rows } from './tabular';

export { parseAllTrades, parseHatch, parseSharesies, pickAllTradesSheet };
export type { HatchOptions };

export function detectKind(rows: Rows): FileKind {
  if (findHeaderRow(rows, SHARESIES_HEADER) >= 0) return 'sharesies';
  if (findHeaderRow(rows, HATCH_HEADER) >= 0) return 'hatch';
  if (findHeaderRow(rows, ALLTRADES_HEADER) >= 0) return 'alltrades';
  return 'unknown';
}

export interface ParseOptions {
  hatch?: HatchOptions;
}

/** Parse one uploaded file (CSV or xlsx bytes). Pure; no I/O. */
export function parseFile(fileName: string, bytes: ArrayBuffer | Uint8Array, opts: ParseOptions = {}): ParseResult {
  let rows: Rows;
  if (isZip(bytes)) {
    const picked = pickAllTradesSheet(xlsxSheets(bytes));
    if (!picked) return { kind: 'unknown', fileName, txns: [], warnings: [`${fileName}: no recognised sheet`], stats: {} };
    rows = picked.rows;
  } else {
    rows = csvRows(decodeText(bytes));
  }
  const kind = detectKind(rows);
  switch (kind) {
    case 'sharesies': return parseSharesies(rows, fileName);
    case 'hatch': return parseHatch(rows, fileName, opts.hatch);
    case 'alltrades': return parseAllTrades(rows, fileName);
    default: return { kind: 'unknown', fileName, txns: [], warnings: [`${fileName}: not a recognised Sharesies, Hatch or Sharesight All Trades export`], stats: {} };
  }
}
