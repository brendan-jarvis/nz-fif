import type { FifClass, HoldingAssumption, Position } from '@nz-fif/core';

export const CLASS_LABEL: Record<FifClass, string> = {
  fif: 'FIF (included)',
  not_fif: 'Not FIF / exempt',
  cash_mmf: 'Cash / money market fund',
  excluded: 'Excluded by you',
  review: 'Review needed',
};

export function ReviewPanel(props: {
  positions: Position[];
  holdings: Record<string, HoldingAssumption>;
  suggestions: Record<string, HoldingAssumption>;
  onChange: (key: string, patch: Partial<HoldingAssumption>) => void;
  onAcceptAll: () => void;
  onDownload: () => void;
  onUpload: (text: string) => void;
}) {
  const review = props.positions.filter((p) => props.holdings[p.key]?.fifClass === 'review').length;
  return (
    <section aria-labelledby="review-h" data-testid="review">
      <h2 id="review-h">3. Which holdings are FIFs?</h2>
      <p>
        Suggestions follow simple rules (crypto → not FIF; money market → cash fund; NZX → not FIF; ASX → check with{' '}
        <a href="https://www.ird.govt.nz/fif-australia-tool" target="_blank" rel="noopener noreferrer">IRD's tool</a>; other foreign listings → FIF).
        You decide. Every choice appears in the report's assumptions table.
      </p>
      <p>
        <button type="button" data-testid="accept-all" onClick={props.onAcceptAll}>Accept all suggestions</button>{' '}
        <button type="button" onClick={props.onDownload}>Download assumptions.json</button>{' '}
        <label class="button">Load assumptions.json
          <input type="file" accept=".json,application/json" class="visually-hidden" data-testid="assumptions-input"
            onChange={async (e) => { const f = e.currentTarget.files?.[0]; if (f) props.onUpload(await f.text()); }} />
        </label>
      </p>
      <p data-testid="review-count" class={review ? 'error' : 'ok'}>{review ? `${review} holding(s) need a decision before the report can be produced.` : 'All holdings classified.'}</p>
      <div class="scroll">
        <table class="data compact">
          <thead><tr><th>Ticker</th><th>Name</th><th>Market</th><th>Source</th><th>Class</th><th>Reason</th><th>Yahoo symbol</th><th>Note</th></tr></thead>
          <tbody>
            {props.positions.map((p) => {
              const h = props.holdings[p.key]!;
              const sug = props.suggestions[p.key]!;
              return (
                <tr key={p.key} class={h.fifClass === 'review' ? 'warn' : ''} data-testid={`row-${p.key}`}>
                  <td>{p.symbol || '(none)'}</td>
                  <td>{p.name}</td>
                  <td>{p.exchange}</td>
                  <td>{p.sources.join(', ')}</td>
                  <td>
                    <select data-testid={`class-${p.key}`} value={h.fifClass}
                      onChange={(e) => {
                        const v = e.currentTarget.value as FifClass;
                        props.onChange(p.key, v === sug.fifClass ? { fifClass: v, source: 'rule', rule: sug.rule, reason: sug.reason } : { fifClass: v, source: 'user', reason: `Your choice (suggested: ${CLASS_LABEL[sug.fifClass]})` });
                      }}>
                      {(Object.keys(CLASS_LABEL) as FifClass[]).map((c) => <option key={c} value={c}>{CLASS_LABEL[c]}</option>)}
                    </select>
                  </td>
                  <td class="flags">{h.reason}</td>
                  <td><input class="sym" value={h.yahooSymbol} onInput={(e) => props.onChange(p.key, { yahooSymbol: e.currentTarget.value.toUpperCase() })} /></td>
                  <td><input class="note" value={h.note ?? ''} placeholder={h.fifClass === 'excluded' ? 'reason (required)' : ''} onInput={(e) => props.onChange(p.key, { note: e.currentTarget.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
