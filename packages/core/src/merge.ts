// Merge broker CSVs with Sharesight All Trades (PLAN §4 "Merge").
// One-to-one assignment on instrument, side, date window, |qty| within 1e-6
// and price within 0.1 %. Candidate pairs are ranked globally (date distance,
// then price difference, then qty difference) and assigned greedily, which
// avoids the mis-pairing a naive first-match join makes when several trades
// share a quantity. The broker CSV wins for quantity, fees, timestamps and
// account; All Trades wins for splits, rows with no CSV match, and FX/NZD
// value (used in Sharesight-match mode). Quantities are never rounded.
import { Decimal } from './decimal';
import { daysBetween } from './dates';
import type { AssetClass, ParseResult, Txn, TxnType } from './types';
import { TRADE_TYPES } from './types';

export interface ReconRow {
  id: string;
  symbol: string;
  exchangeDate: string;
  type: TxnType;
  qty: string;
  assetClass: AssetClass;
  source: Txn['source'];
}

export interface Reconciliation {
  matched: number;
  matchedBySource: Record<string, number>;
  allTradesOnly: ReconRow[];
  csvOnly: ReconRow[];
  allTradesOnlyByClass: Record<string, number>;
  allTradesOnlyByType: Record<string, number>;
  duplicatesIgnored: string[];
  /** Matched pairs whose broker date differs from Sharesight's date. */
  dateShifted: number;
}

export interface MergeResult {
  txns: Txn[];
  recon: Reconciliation;
}

const QTY_TOL = new Decimal('1e-6');
const PRICE_TOL = new Decimal('0.001');

function side(t: Txn): 'in' | 'out' | null {
  if (!TRADE_TYPES.has(t.type)) return null;
  return new Decimal(t.qty).gte(0) ? 'in' : 'out';
}

/** Allowed date offsets (Sharesight date − broker date) and the ideal offset. */
function dateWindow(broker: Txn): { min: number; max: number; ideal: number; base: string } {
  if (broker.source === 'hatch') return { min: -2, max: 0, ideal: -1, base: broker.nzDate };
  return { min: -1, max: 1, ideal: 0, base: broker.exchangeDate };
}

interface Candidate { b: number; a: number; dateDist: number; priceDiff: number; qtyDiff: number }

export function mergeSources(results: ParseResult[]): MergeResult {
  // Ignore an identical file uploaded twice (same kind and same source refs).
  const seen = new Set<string>();
  const duplicatesIgnored: string[] = [];
  const unique = results.filter((r) => {
    const sig = `${r.kind}|${r.txns.length}|${r.txns.slice(0, 5).map((t) => `${t.symbol}${t.exchangeDate}${t.qty}`).join(',')}|${r.txns.slice(-5).map((t) => `${t.symbol}${t.exchangeDate}${t.qty}`).join(',')}`;
    if (seen.has(sig)) { duplicatesIgnored.push(r.fileName); return false; }
    seen.add(sig);
    return true;
  });

  const allTrades = unique.filter((r) => r.kind === 'alltrades').flatMap((r) => r.txns);
  const brokerAll = unique.filter((r) => r.kind === 'sharesies' || r.kind === 'hatch').flatMap((r) => r.txns);
  const brokerTrades = brokerAll.filter((t) => TRADE_TYPES.has(t.type));
  const brokerOther = brokerAll.filter((t) => !TRADE_TYPES.has(t.type));

  // Index All Trades rows by instrument + side for candidate search.
  const byKey = new Map<string, number[]>();
  allTrades.forEach((t, i) => {
    const sd = side(t);
    if (!sd) return;
    const k = `${t.instrumentKey}|${sd}`;
    const list = byKey.get(k) ?? [];
    list.push(i);
    byKey.set(k, list);
  });

  const cands: Candidate[] = [];
  brokerTrades.forEach((b, bi) => {
    const sd = side(b)!;
    const win = dateWindow(b);
    const bq = new Decimal(b.qty).abs();
    const bp = b.price ? new Decimal(b.price) : null;
    for (const ai of byKey.get(`${b.instrumentKey}|${sd}`) ?? []) {
      const a = allTrades[ai]!;
      const off = daysBetween(win.base, a.exchangeDate);
      if (off < win.min || off > win.max) continue;
      const qtyDiff = new Decimal(a.qty).abs().minus(bq).abs();
      if (qtyDiff.gt(QTY_TOL)) continue;
      let priceDiff = 0;
      if (bp && a.price) {
        const ap = new Decimal(a.price);
        const rel = ap.minus(bp).abs().div(bp.isZero() ? 1 : bp);
        if (rel.gt(PRICE_TOL)) continue;
        priceDiff = rel.toNumber();
      }
      cands.push({ b: bi, a: ai, dateDist: Math.abs(off - win.ideal), priceDiff, qtyDiff: qtyDiff.toNumber() });
    }
  });
  cands.sort((x, y) => x.dateDist - y.dateDist || x.priceDiff - y.priceDiff || x.qtyDiff - y.qtyDiff || x.b - y.b || x.a - y.a);

  const bUsed = new Map<number, number>();
  const aUsed = new Set<number>();
  for (const c of cands) {
    if (bUsed.has(c.b) || aUsed.has(c.a)) continue;
    bUsed.set(c.b, c.a);
    aUsed.add(c.a);
  }

  const out: Txn[] = [];
  const matchedBySource: Record<string, number> = {};
  let dateShifted = 0;
  brokerTrades.forEach((b, bi) => {
    const ai = bUsed.get(bi);
    if (ai === undefined) { out.push({ ...b, flags: [...b.flags, 'csv_only_no_alltrades_match'] }); return; }
    const a = allTrades[ai]!;
    matchedBySource[b.source] = (matchedBySource[b.source] ?? 0) + 1;
    const flags = [...b.flags.filter((f) => f !== 'exchange_date_inferred_nz_minus_1'), 'matched_alltrades'];
    if (a.exchangeDate !== b.exchangeDate) { flags.push(`exchange_date_from_sharesight:${a.exchangeDate}`); dateShifted++; }
    out.push({
      ...b,
      // Sharesight's exchange code and date are authoritative for the venue
      // calendar (Hatch has no exchange column; its US date is inferred).
      exchange: b.source === 'hatch' ? a.exchange : b.exchange,
      exchangeDate: a.exchangeDate,
      name: b.name || a.name,
      ...(a.fxForeignPerNzd ? { fxForeignPerNzd: a.fxForeignPerNzd } : {}),
      fxSource: a.fxSource,
      ...(a.nzdValue ? { nzdValue: a.nzdValue } : {}),
      provenance: [...b.provenance, ...a.provenance],
      flags,
    });
  });

  const allTradesOnly: ReconRow[] = [];
  allTrades.forEach((a, ai) => {
    if (aUsed.has(ai)) return;
    out.push({ ...a, flags: [...a.flags, 'alltrades_only'] });
    allTradesOnly.push(reconRow(a));
  });
  out.push(...brokerOther);

  out.sort((x, y) => (x.exchangeDate < y.exchangeDate ? -1 : x.exchangeDate > y.exchangeDate ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  const csvOnly = brokerTrades.filter((_, bi) => !bUsed.has(bi)).map(reconRow);
  const countBy = (rows: ReconRow[], f: (r: ReconRow) => string) =>
    rows.reduce<Record<string, number>>((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
  return {
    txns: out,
    recon: {
      matched: bUsed.size,
      matchedBySource,
      allTradesOnly,
      csvOnly,
      allTradesOnlyByClass: countBy(allTradesOnly, (r) => r.assetClass),
      allTradesOnlyByType: countBy(allTradesOnly, (r) => r.type),
      duplicatesIgnored,
      dateShifted,
    },
  };
}

function reconRow(t: Txn): ReconRow {
  return { id: t.id, symbol: t.symbol, exchangeDate: t.exchangeDate, type: t.type, qty: t.qty, assetClass: t.assetClass, source: t.source };
}
