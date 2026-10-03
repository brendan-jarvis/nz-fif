import { useState } from 'preact/hooks';
import type { ParseResult } from '@nz-fif/core';
import { readFiles, type LoadedFile } from '../io/readFile';

const KIND_LABEL: Record<string, string> = {
  sharesies: 'Sharesies transactions',
  hatch: 'Hatch transactions',
  alltrades: 'Sharesight All Trades',
  unknown: 'Not recognised',
};

export function UploadPanel(props: {
  onFiles: (files: LoadedFile[]) => void;
  results: ParseResult[] | null;
  txnCountByFile: number[];
  busy: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const take = async (list: FileList | null) => {
    if (list && list.length) props.onFiles(await readFiles(list));
  };
  return (
    <section aria-labelledby="upload-h">
      <h2 id="upload-h">1. Load your exports</h2>
      <p>
        Sharesies transaction CSV, Hatch transaction CSV and/or Sharesight <em>All Trades</em> (xlsx or csv). A full-history
        All Trades export gives opening holdings. Files are read into this tab's memory only; they are never uploaded or stored.
      </p>
      <label
        class={`dropzone${drag ? ' drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer?.files ?? null); }}
      >
        <span>Drop files here or choose files</span>
        <input type="file" multiple accept=".csv,.xlsx" data-testid="file-input" onChange={(e) => void take((e.currentTarget as HTMLInputElement).files)} />
      </label>
      {props.busy && <p data-testid="parsing">Reading files…</p>}
      {props.results && (
        <table class="data" data-testid="file-list">
          <thead><tr><th>File</th><th>Detected as</th><th>Rows used</th><th>Notes</th></tr></thead>
          <tbody>
            {props.results.map((r, i) => (
              <tr key={r.fileName + i} class={r.kind === 'unknown' ? 'warn' : ''}>
                <td>{r.fileName}</td>
                <td data-testid={`kind-${i}`}>{KIND_LABEL[r.kind]}</td>
                <td class="num" data-testid={`count-${i}`}>{props.txnCountByFile[i] ?? 0}</td>
                <td>
                  {statLine(r)}
                  {r.warnings.length > 0 && (
                    <details><summary>{r.warnings.length} warning(s)</summary><ul>{r.warnings.slice(0, 50).map((w) => <li key={w}>{w}</li>)}</ul></details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function statLine(r: ParseResult): string {
  const s = r.stats;
  switch (r.kind) {
    case 'sharesies': return `${s.buy ?? 0} buys (${s.drpLikely ?? 0} system-initiated, treated as DRP), ${s.sell ?? 0} sells`;
    case 'hatch': return `${s.orders ?? 0} orders (${s.buy ?? 0} buys, ${s.sell ?? 0} sells), ${s.cancelled ?? 0} cancelled dropped, ${s.dividend ?? 0} dividends, ${s.amountMismatch ?? 0} amount differences flagged`;
    case 'alltrades': return `${s.type_BUY ?? 0} buys, ${s.type_SELL ?? 0} sells, ${s.type_DRP ?? 0} reinvestments, ${s.type_SPLIT ?? 0} splits; ${s.crypto ?? 0} crypto, ${s.other ?? 0} other`;
    default: return '';
  }
}
