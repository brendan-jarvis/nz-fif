// Builds private/denylist.txt from your REAL exports so the pre-commit hook
// can block them from ever being committed. Run locally only:
//   bun scripts/build-denylist.ts <export files...> [--names "Name1,Name2"]
// Extracts: trade IDs, distinctive quantities and amounts (>= 5 significant
// digits), and any names you pass. The output stays in private/ (git-ignored).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const args = process.argv.slice(2);
const namesIdx = args.indexOf('--names');
const names = namesIdx >= 0 ? (args[namesIdx + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [];
const files = args.filter((_, i) => i !== namesIdx && i !== namesIdx + 1);

const QTY_COLS = /^(quantity|qty|amount|amount \(usd\)|value|transaction fee|brokerage|order share quantity|order fee|trade id)$/i;
const out = new Set<string>(names);

function sigDigits(s: string): number {
  return s.replace(/^[-+]?0*\.?0*/, '').replace(/\./, '').replace(/0+$/, '').length;
}

function addValue(raw: unknown) {
  const s = String(raw ?? '').trim();
  if (!s) return;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) { out.add(s); return; }
  if (/^-?\d+(\.\d+)?$/.test(s) && sigDigits(s) >= 5) {
    const abs = s.replace(/^-/, '');
    out.add(abs);
    if (abs.includes('.')) out.add(abs.replace(/0+$/, '').replace(/\.$/, ''));
  }
}

for (const f of files) {
  const wb = XLSX.read(readFileSync(f), { type: 'buffer', raw: true });
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, { header: 1, raw: true });
    const headerIdx = rows.findIndex((r) => r.some((c) => typeof c === 'string' && QTY_COLS.test(c.trim())));
    if (headerIdx < 0) continue;
    const header = rows[headerIdx]!.map((c) => String(c ?? '').trim());
    const cols = header.map((h, i) => (QTY_COLS.test(h) ? i : -1)).filter((i) => i >= 0);
    for (const r of rows.slice(headerIdx + 1)) for (const i of cols) addValue(r[i]);
  }
}
// Very short tokens would cause false positives.
const lines = [...out].filter((s) => s.length >= 6).sort();
mkdirSync('private', { recursive: true });
writeFileSync('private/denylist.txt', lines.join('\n') + '\n');
console.log(`private/denylist.txt: ${lines.length} literals from ${files.length} file(s).`);
