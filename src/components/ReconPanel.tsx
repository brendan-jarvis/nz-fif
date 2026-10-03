import type { Reconciliation, ReconRow } from '@nz-fif/core';

export function ReconPanel({ recon }: { recon: Reconciliation }) {
  const matchedText = Object.entries(recon.matchedBySource).map(([k, v]) => `${v} ${k}`).join(' + ') || '0';
  return (
    <section aria-labelledby="recon-h" data-testid="recon">
      <h2 id="recon-h">Reconciliation</h2>
      <p>Each broker trade is paired with at most one Sharesight row (same instrument, side, date window, quantity within 1e-6, price within 0.1 %).</p>
      <table class="data compact">
        <tbody>
          <tr><th>Matched</th><td class="num" data-testid="recon-matched">{recon.matched}</td><td>{matchedText}</td></tr>
          <tr><th>All Trades only</th><td class="num" data-testid="recon-at-only">{recon.allTradesOnly.length}</td><td>{fmtCounts(recon.allTradesOnlyByClass)}; {fmtCounts(recon.allTradesOnlyByType)}</td></tr>
          <tr><th>CSV only</th><td class="num" data-testid="recon-csv-only">{recon.csvOnly.length}</td><td>Broker trades with no Sharesight row (e.g. outside the All Trades date range)</td></tr>
          {recon.duplicatesIgnored.length > 0 && <tr><th>Duplicates ignored</th><td class="num">{recon.duplicatesIgnored.length}</td><td>{recon.duplicatesIgnored.join(', ')}</td></tr>}
        </tbody>
      </table>
      <RowList title="All Trades only" rows={recon.allTradesOnly} />
      <RowList title="CSV only" rows={recon.csvOnly} />
    </section>
  );
}

function fmtCounts(m: Record<string, number>): string {
  const e = Object.entries(m);
  return e.length ? e.map(([k, v]) => `${v} ${k}`).join(', ') : 'none';
}

function RowList({ title, rows }: { title: string; rows: ReconRow[] }) {
  if (!rows.length) return null;
  return (
    <details>
      <summary>{title}: {rows.length} rows</summary>
      <table class="data compact">
        <thead><tr><th>Date</th><th>Symbol</th><th>Type</th><th class="num">Qty</th><th>Class</th><th>Source</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.exchangeDate}</td><td>{r.symbol}</td><td>{r.type}</td><td class="num">{r.qty}</td><td>{r.assetClass}</td><td>{r.source}</td></tr>)}</tbody>
      </table>
    </details>
  );
}
