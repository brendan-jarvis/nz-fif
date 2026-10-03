// Read CSV text or xlsx bytes into rows of cells. Pure functions over bytes.
import * as XLSX from 'xlsx';

export type Cell = string | number | boolean | null;
export type Rows = Cell[][];

export function decodeText(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = new TextDecoder('utf-8').decode(u8);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

/**
 * RFC 4180 CSV reader (quoted fields, "" escapes, CR/LF/CRLF, newlines inside
 * quotes). Hand-written so the bundle carries no network-capable CSV library.
 * Blank lines are skipped.
 */
export function csvRows(text: string): Rows {
  const rows: Rows = [];
  let row: Cell[] = [];
  let field = '';
  let inQuotes = false;
  let fieldQuoted = false;
  const endField = () => { row.push(field); field = ''; fieldQuoted = false; };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === '' )) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '' && !fieldQuoted) { inQuotes = true; fieldQuoted = true; continue; }
    if (c === ',') { endField(); continue; }
    if (c === '\r') { if (text[i + 1] === '\n') i++; endRow(); continue; }
    if (c === '\n') { endRow(); continue; }
    field += c;
  }
  if (field !== '' || row.length > 0 || fieldQuoted) endRow();
  return rows.filter((r) => r.some((x) => x !== '' && x !== null));
}

export function isZip(bytes: ArrayBuffer | Uint8Array): boolean {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
}

export function xlsxSheets(bytes: ArrayBuffer | Uint8Array): Map<string, Rows> {
  // raw values, no date coercion: AllTrades stores dates as text already.
  const wb = XLSX.read(bytes, { type: 'array', raw: true, cellDates: false, cellStyles: false, cellHTML: false, cellFormula: false });
  const out = new Map<string, Rows>();
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    out.set(name, XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false }));
  }
  return out;
}

export function cellStr(c: Cell | undefined): string {
  if (c === null || c === undefined) return '';
  return typeof c === 'number' ? String(c) : String(c).trim();
}

export function findHeaderRow(rows: Rows, required: string[], maxScan = 20): number {
  const req = required.map((r) => r.toLowerCase());
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const cells = (rows[i] ?? []).map((c) => cellStr(c).toLowerCase());
    if (req.every((r) => cells.includes(r))) return i;
  }
  return -1;
}

export function indexHeader(header: Cell[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => {
    const k = cellStr(h).toLowerCase();
    if (k && !m.has(k)) m.set(k, i);
  });
  return m;
}
