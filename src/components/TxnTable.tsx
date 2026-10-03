import { useMemo, useState } from 'preact/hooks';
import type { Txn } from '@nz-fif/core';

export function TxnTable({ txns }: { txns: Txn[] }) {
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const f = filter.trim().toUpperCase();
    return f ? txns.filter((t) => t.symbol.includes(f) || t.type.includes(f) || t.source.toUpperCase().includes(f)) : txns;
  }, [txns, filter]);
  return (
    <details>
      <summary>All normalised transactions ({txns.length})</summary>
      <input type="search" placeholder="Filter by symbol, type or source" value={filter} onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)} />
      <table class="data compact">
        <thead><tr><th>Exchange date</th><th>NZ date</th><th>Symbol</th><th>Market</th><th>Type</th><th class="num">Qty</th><th class="num">Price</th><th>Ccy</th><th class="num">Fee</th><th class="num">NZD (Sharesight)</th><th>Source</th><th>Flags</th></tr></thead>
        <tbody>
          {rows.slice(0, 1000).map((t) => (
            <tr key={t.id}>
              <td>{t.exchangeDate}</td><td>{t.nzDate}</td><td>{t.symbol}</td><td>{t.exchange}</td><td>{t.type}</td>
              <td class="num">{t.qty}</td><td class="num">{t.price}</td><td>{t.currency}</td><td class="num">{t.fee}</td>
              <td class="num">{t.nzdValue ?? ''}</td><td>{t.source}</td><td class="flags">{t.flags.filter((f) => !f.startsWith('description:')).join(' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 1000 && <p>Showing the first 1000 rows.</p>}
    </details>
  );
}
