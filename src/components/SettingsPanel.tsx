import type { CalcOptions } from '@nz-fif/core';

const RATES = ['0.105', '0.175', '0.30', '0.33', '0.39'];

export function SettingsPanel(props: { years: number[]; year: number; setYear: (y: number) => void; opts: CalcOptions; setOpts: (o: CalcOptions) => void }) {
  const { opts, setOpts } = props;
  const set = <K extends keyof CalcOptions>(k: K, v: CalcOptions[K]) => setOpts({ ...opts, [k]: v });
  return (
    <section aria-labelledby="settings-h">
      <h2 id="settings-h">2. Year and settings</h2>
      <div class="grid">
        <label>Income year
          <select data-testid="year" value={props.year} onChange={(e) => props.setYear(Number(e.currentTarget.value))}>
            {props.years.map((y) => <option key={y} value={y}>1 Apr {y - 1} – 31 Mar {y}</option>)}
          </select>
        </label>
        <label>Trade date basis
          <select value={opts.dateBasis} onChange={(e) => set('dateBasis', e.currentTarget.value as CalcOptions['dateBasis'])}>
            <option value="exchange">Exchange date (matches Sharesight)</option>
            <option value="nz">New Zealand date</option>
          </select>
        </label>
        <label>Exchange rates
          <select data-testid="fx-mode" value={opts.fxMode} onChange={(e) => set('fxMode', e.currentTarget.value as CalcOptions['fxMode'])}>
            <option value="rbnz">RBNZ actual daily rates (bundled)</option>
            <option value="trade">Sharesight per-trade rates (match mode)</option>
          </select>
        </label>
        <label>Quick sale gain cost
          <select value={opts.qsGainCost} onChange={(e) => set('qsGainCost', e.currentTarget.value as CalcOptions['qsGainCost'])}>
            <option value="average">Year-average cost, LIFO (s EX 52)</option>
            <option value="lot">Each lot's own cost, LIFO</option>
          </select>
        </label>
        <label>Marginal tax rate (caps tax credits)
          <select value={opts.marginalRate} onChange={(e) => set('marginalRate', e.currentTarget.value)}>
            {RATES.map((r) => <option key={r} value={r}>{(Number(r) * 100).toFixed(1).replace(/\.0$/, '')}%</option>)}
          </select>
        </label>
        <label class="check"><input type="checkbox" checked={opts.includeDividends} onChange={(e) => set('includeDividends', e.currentTarget.checked)} /> Include dividends in CV</label>
      </div>
    </section>
  );
}
