import type { Assumptions, CashFundResult, Txn } from '@nz-fif/core';
import { money2 } from '@nz-fif/core';

type Cash = Assumptions['cashFunds'];

export function CashPanel(props: { fundKeys: string[]; unassigned: Txn[]; cash: Cash; setCash: (c: Cash) => void; results: CashFundResult[] }) {
  const { cash, setCash } = props;
  if (!props.fundKeys.length && !props.unassigned.length) return null;
  const bal = (k: string) => cash.balances[k] ?? { openingBalance: '0', closingBalance: '0' };
  const setBal = (k: string, patch: Partial<Cash['balances'][string]>) => setCash({ ...cash, balances: { ...cash.balances, [k]: { ...bal(k), ...patch } } });
  return (
    <section aria-labelledby="cash-h" data-testid="cash">
      <h3 id="cash-h">Cash / money market funds</h3>
      <p class="note">
        Excluded by default. This is <strong>your assumption, not an IRD exemption</strong>: IRD determinations for similar USD money market
        funds keep them as FIF interests that may not use FDR. Include them to see the effect.
      </p>
      <label class="check"><input type="checkbox" data-testid="cash-include" checked={cash.include} onChange={(e) => setCash({ ...cash, include: e.currentTarget.checked })} /> Include cash funds</label>{' '}
      <select value={cash.treatment} onChange={(e) => setCash({ ...cash, treatment: e.currentTarget.value as Cash['treatment'] })}>
        <option value="cv">CV only (default)</option>
        <option value="same">Same method as the portfolio (Hatch's approach)</option>
      </select>
      {props.fundKeys.length > 0 && (
        <table class="data compact">
          <thead><tr><th>Fund</th><th>Balance 1 Apr</th><th>Balance 31 Mar</th><th>Exit date (if fully withdrawn)</th><th>CV estimate NZD</th></tr></thead>
          <tbody>
            {props.fundKeys.map((k) => (
              <tr key={k}>
                <td>{k}</td>
                <td><input class="num" value={bal(k).openingBalance} onInput={(e) => setBal(k, { openingBalance: e.currentTarget.value })} /></td>
                <td><input class="num" value={bal(k).closingBalance} onInput={(e) => setBal(k, { closingBalance: e.currentTarget.value })} /></td>
                <td><input type="date" value={bal(k).exitDate ?? ''} onInput={(e) => setBal(k, { exitDate: e.currentTarget.value })} /></td>
                <td class="num">{money2(props.results.find((r) => r.key === k)?.cv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {props.unassigned.length > 0 && (
        <>
          <p>Dividends with no ticker in the broker file. Assign each to a holding, or leave unassigned (ignored):</p>
          <table class="data compact">
            <thead><tr><th>Date</th><th>Description</th><th>Gross</th><th>Assign to</th></tr></thead>
            <tbody>
              {props.unassigned.map((t) => (
                <tr key={t.id}>
                  <td>{t.nzDate}</td><td>{t.name}</td><td class="num">{t.dividend?.gross} {t.currency}</td>
                  <td>
                    <select value={cash.dividendAssignments[t.id] ?? ''} onChange={(e) => {
                      const v = e.currentTarget.value;
                      const next = { ...cash.dividendAssignments };
                      if (v) next[t.id] = v; else delete next[t.id];
                      setCash({ ...cash, dividendAssignments: next });
                    }}>
                      <option value="">(unassigned)</option>
                      {props.fundKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
