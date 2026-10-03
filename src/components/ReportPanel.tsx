import type { CashFundComparison, HoldingAssumption, PortfolioResult } from '@nz-fif/core';
import { allTables, money2, REPORT_DISCLAIMER, resultToJson } from '@nz-fif/core';
import { downloadText } from '../io/download';
import { TableView } from './TableView';

export function ReportPanel(props: { result: PortfolioResult; holdings: HoldingAssumption[]; extra: Array<[string, string]>; cash: CashFundComparison | null }) {
  const r = props.result;
  const base = `nz-fif-${r.year}`;
  if (r.blocked) {
    return (
      <section aria-labelledby="report-h" data-testid="report-blocked">
        <h2 id="report-h">5. Report</h2>
        <p class="error">The report needs:</p>
        <ul>{r.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
      </section>
    );
  }
  const t = r.totals!;
  const tables = allTables(r, props.holdings, props.extra, props.cash);
  return (
    <section aria-labelledby="report-h" data-testid="report" class="report">
      <h2 id="report-h">5. FIF report: 1 Apr {r.year - 1} – 31 Mar {r.year}</h2>
      <p class="disclaimer">{REPORT_DISCLAIMER}</p>
      <div class="cards">
        <div class="card"><div class="label">FDR income</div><div class="big" data-testid="total-fdr">{money2(t.fdr)}</div></div>
        <div class="card"><div class="label">CV income</div><div class="big" data-testid="total-cv">{money2(t.cv)}</div></div>
        <div class="card"><div class="label">Lower (if you may choose)</div><div class="big" data-testid="lower">{t.lower}</div></div>
        <div class="card"><div class="label">Quick sale adjustment</div><div class="big" data-testid="total-qsa">{money2(t.qsa)}</div></div>
      </div>
      {!r.deMinimis.exceeds && <p class="ok">Cost of FIF interests stayed at or under NZ$50,000 all year: as a natural person you may not need to apply the FIF rules (IR461 p.9).</p>}
      <p class="no-print">
        <button type="button" data-testid="download-json" onClick={() => downloadText(`${base}.json`, resultToJson(r, { cashFunds: props.cash }), 'application/json')}>Download JSON (full precision)</button>{' '}
        <button type="button" onClick={() => window.print()}>Print / save as PDF</button>
      </p>
      {tables.map((tb) => <TableView key={tb.id} t={tb} fileBase={base} />)}
    </section>
  );
}
