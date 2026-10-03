import type { Table } from '@nz-fif/core';
import { tableToCsv } from '@nz-fif/core';
import { downloadText } from '../io/download';

export function TableView({ t, fileBase }: { t: Table; fileBase: string }) {
  return (
    <div class="report-table" data-testid={`table-${t.id}`}>
      <h3>
        {t.title}{' '}
        <button type="button" class="link no-print" onClick={() => downloadText(`${fileBase}-${t.id}.csv`, tableToCsv(t), 'text/csv')}>CSV</button>
      </h3>
      {t.rows.length === 0 ? <p class="muted">None.</p> : (
        <div class="scroll">
          <table class="data compact">
            <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} class={/^-?[\d,]+(\.\d+)?$/.test(c) ? 'num' : ''}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {t.note && <p class="note">{t.note}</p>}
    </div>
  );
}
