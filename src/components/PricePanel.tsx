import { useState } from 'preact/hooks';
import type { PriceInput } from '@nz-fif/core';
import { fetchPrice } from '../net/priceClient';

export interface PriceNeed {
  key: string;
  symbol: string;
  yahooSymbol: string;
  currency: string;
  which: 'opening' | 'closing';
  date: string;
  qty: string;
}

type Prices = Record<string, { opening?: PriceInput; closing?: PriceInput }>;

export function PricePanel(props: { needs: PriceNeed[]; prices: Prices; setPrice: (key: string, which: 'opening' | 'closing', p: PriceInput | undefined) => void }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const missing = props.needs.filter((n) => !props.prices[n.key]?.[n.which]);
  const lookups = missing.map((n) => ({ ...n, sym: n.yahooSymbol }));

  const run = async () => {
    setConsent(false);
    setBusy(true);
    const out: string[] = [];
    for (const n of lookups) {
      const r = await fetchPrice(n.sym, n.date).catch(() => ({ ok: false as const, status: 0, reason: 'invalid symbol' }));
      if (r.ok) {
        const p = r.price;
        const split = p.splitsAfter.length ? ` (close ${p.close} × later splits ${p.splitsAfter.map((s) => `${s.ratio} on ${s.date}`).join(', ')})` : '';
        props.setPrice(n.key, n.which, { price: String(p.rawClose), currency: p.currency, date: p.tradingDate, source: `Yahoo close ${p.tradingDate}${split}` });
        out.push(`${n.sym} ${n.date}: ${p.rawClose} ${p.currency} (${p.tradingDate})${split}`);
      } else {
        out.push(`${n.sym} ${n.date}: not found (${r.reason}); enter it by hand`);
      }
    }
    setLog(out);
    setBusy(false);
  };

  return (
    <section aria-labelledby="prices-h" data-testid="prices">
      <h2 id="prices-h">4. Prices on 31 March</h2>
      <p>
        Opening values use the close on 31 March before the year; closing values the close on 31 March at the end. Enter prices by hand
        (for example from your Sharesight report), or look them up. A lookup sends <strong>only a ticker and a date</strong> to this site's
        price route, which asks Yahoo Finance. Nothing else leaves this tab.
      </p>
      {props.needs.length === 0 ? <p class="muted">No FIF holdings need a price.</p> : (
        <>
          <p>
            <button type="button" data-testid="lookup" disabled={busy || lookups.length === 0} onClick={() => setConsent(true)}>
              Look up {lookups.length} missing price(s)…
            </button>{' '}
            {busy && <span data-testid="lookup-busy">Looking up…</span>}
          </p>
          {consent && (
            <div class="consent" role="dialog" aria-labelledby="consent-h" data-testid="consent">
              <h3 id="consent-h">Send these ticker/date pairs?</h3>
              <p>Only the following will be sent, one request each, to <code>/api/price</code>. No quantities, values, names or files.</p>
              <ul data-testid="consent-list">{lookups.map((n) => <li key={`${n.key}${n.which}`}><code>{n.sym}</code> on <code>{n.date}</code></li>)}</ul>
              <button type="button" data-testid="consent-yes" onClick={() => void run()}>Send {lookups.length} lookup(s)</button>{' '}
              <button type="button" onClick={() => setConsent(false)}>Cancel</button>
            </div>
          )}
          {log.length > 0 && <details open><summary>Lookup results</summary><ul data-testid="lookup-log">{log.map((l) => <li key={l}>{l}</li>)}</ul></details>}
          <div class="scroll">
            <table class="data compact">
              <thead><tr><th>Holding</th><th>Value at</th><th>Date</th><th>Units</th><th>Price</th><th>Currency</th><th>Source</th></tr></thead>
              <tbody>
                {props.needs.map((n) => {
                  const p = props.prices[n.key]?.[n.which];
                  return (
                    <tr key={`${n.key}-${n.which}`} class={p ? '' : 'warn'}>
                      <td>{n.symbol}</td><td>{n.which}</td><td>{n.date}</td><td class="num">{n.qty}</td>
                      <td><input class="num" data-testid={`price-${n.key}-${n.which}`} value={p?.price ?? ''}
                        onChange={(e) => {
                          const v = e.currentTarget.value.trim();
                          props.setPrice(n.key, n.which, /^\d+(\.\d+)?$/.test(v) ? { price: v, currency: p?.currency || n.currency, date: n.date, source: 'entered by you' } : undefined);
                        }} /></td>
                      <td>{p?.currency ?? n.currency}</td>
                      <td class="flags">{p?.source ?? 'missing'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
