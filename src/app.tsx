import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  DEFAULT_OPTIONS, FxTable, parseAssumptions, serializeAssumptions,
  type Assumptions, type CalcOptions, type FxTableJson, type HoldingAssumption, type MergeResult, type ParseResult, type PriceInput,
} from '@nz-fif/core';
import type { LoadedFile } from './io/readFile';
import { downloadText } from './io/download';
import { parseInWorker } from './parseClient';
import { UploadPanel } from './components/UploadPanel';
import { ReconPanel } from './components/ReconPanel';
import { TxnTable } from './components/TxnTable';
import { SettingsPanel } from './components/SettingsPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { CashPanel } from './components/CashPanel';
import { PricePanel } from './components/PricePanel';
import { ReportPanel } from './components/ReportPanel';
import { applyAssignments, availableYears, cashComparison, positionsFor, priceNeeds, runCalc, suggestionFor, type Cash, type Prices } from './model';

export const DISCLAIMER =
  'Not tax advice. nz-fif is a calculation aid. It does not decide your tax residence, ' +
  'whether an interest is a FIF, whether an exemption applies, or which method you must use.';

const HATCH_GROSS_UP = '0.15';
const EMPTY_CASH: Cash = { include: false, treatment: 'cv', balances: {}, dividendAssignments: {} };

export function App() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ParseResult[] | null>(null);
  const [counts, setCounts] = useState<number[]>([]);
  const [merged, setMerged] = useState<MergeResult | null>(null);
  const [year, setYear] = useState(0);
  const [opts, setOpts] = useState<CalcOptions>(DEFAULT_OPTIONS);
  const [choices, setChoices] = useState<Record<string, HoldingAssumption>>({});
  const [prices, setPrices] = useState<Prices>({});
  const [cash, setCash] = useState<Cash>(EMPTY_CASH);
  const [fx, setFx] = useState<FxTable | null>(null);

  const onFiles = async (files: LoadedFile[]) => {
    setBusy(true);
    setError(null);
    const res = await parseInWorker(files);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setResults(res.results);
    setCounts(res.txnCountByFile);
    setMerged(res.merged);
  };

  const today = new Date().toISOString().slice(0, 10);
  const yearInfo = useMemo(() => (merged ? availableYears(merged.txns, today) : null), [merged, today]);
  useEffect(() => { if (yearInfo && !yearInfo.years.includes(year)) setYear(yearInfo.preferred); }, [yearInfo]);
  useEffect(() => {
    if (merged && !fx) {
      void import('@nz-fif/core/data/rbnz-b1-daily.json').then((m) => setFx(new FxTable((m.default ?? m) as unknown as FxTableJson)));
    }
  }, [merged, fx]);

  const txns = useMemo(() => (merged ? applyAssignments(merged.txns, cash) : []), [merged, cash.dividendAssignments]);
  const positions = useMemo(() => (merged && year ? positionsFor(txns, year, opts) : []), [txns, year, opts.dateBasis]);
  const suggestions = useMemo(() => Object.fromEntries(positions.map((p) => [p.key, suggestionFor(p)])), [positions]);
  const holdings = useMemo(() => {
    const out: Record<string, HoldingAssumption> = {};
    for (const p of positions) out[p.key] = choices[p.key] ?? suggestions[p.key]!;
    return out;
  }, [positions, suggestions, choices]);
  const unassigned = useMemo(() => (merged ? merged.txns.filter((t) => t.type === 'DIVIDEND' && t.instrumentKey.startsWith('UNASSIGNED:')) : []), [merged]);
  const needs = useMemo(() => (year ? priceNeeds(positions, holdings, year) : []), [positions, holdings, year]);
  const result = useMemo(() => (fx && year && positions.length ? runCalc(txns, year, opts, holdings, prices, fx) : null), [fx, txns, year, opts, holdings, prices, positions]);
  const cashCmp = useMemo(() => (fx && year ? cashComparison(txns, positions, holdings, cash, year, fx) : null), [fx, txns, positions, holdings, cash, year]);

  const change = (key: string, patch: Partial<HoldingAssumption>) => setChoices((c) => ({ ...c, [key]: { ...(c[key] ?? holdings[key]!), ...patch } }));
  const acceptAll = () => setChoices((c) => {
    const next = { ...c };
    for (const p of positions) if (!next[p.key]) next[p.key] = { ...suggestions[p.key]! }; // Review items stay Review: they need your decision.
    return next;
  });
  const setPrice = (key: string, which: 'opening' | 'closing', p: PriceInput | undefined) => setPrices((all) => {
    const cur = { ...(all[key] ?? {}) };
    if (p) cur[which] = p; else delete cur[which];
    return { ...all, [key]: cur };
  });
  const assumptions = (): Assumptions => ({
    format: 'nz-fif-assumptions', version: 1, year, holdings: positions.map((p) => holdings[p.key]!),
    options: { dateBasis: opts.dateBasis, fxMode: opts.fxMode, qsGainCost: opts.qsGainCost, includeDividends: opts.includeDividends, marginalRate: opts.marginalRate },
    cashFunds: cash, hatchGrossUpRate: HATCH_GROSS_UP, prices,
  });
  const loadAssumptions = (text: string) => {
    try {
      const a = parseAssumptions(text);
      setYear(a.year);
      setOpts({ ...opts, ...a.options });
      setChoices(Object.fromEntries(a.holdings.map((h) => [h.key, h])));
      setPrices(a.prices);
      setCash(a.cashFunds);
      setError(null);
    } catch (e) {
      setError(`Could not load assumptions: ${(e as Error).message}`);
    }
  };
  const cashForReport = cash.include && cashCmp && cashCmp.cmp.funds.length ? cashCmp.cmp : null;

  return (
    <main>
      <header>
        <h1>nz-fif</h1>
        <p class="tagline">NZ foreign investment fund (FIF) calculator. Everything runs in this tab; nothing is uploaded or stored.</p>
        <p class="disclaimer" data-testid="disclaimer">{DISCLAIMER}</p>
      </header>
      <UploadPanel onFiles={onFiles} results={results} txnCountByFile={counts} busy={busy} />
      {error && <p class="error" role="alert">{error}</p>}
      {merged && (
        <>
          <ReconPanel recon={merged.recon} />
          <details><summary>All transactions ({merged.txns.length})</summary><TxnTable txns={merged.txns} /></details>
          {yearInfo && year > 0 && <SettingsPanel years={yearInfo.years} year={year} setYear={setYear} opts={opts} setOpts={setOpts} />}
          {positions.length > 0 && (
            <ReviewPanel positions={positions} holdings={holdings} suggestions={suggestions} onChange={change} onAcceptAll={acceptAll}
              onDownload={() => downloadText(`nz-fif-assumptions-${year}.json`, serializeAssumptions(assumptions()), 'application/json')}
              onUpload={loadAssumptions} />
          )}
          {cashCmp && <CashPanel fundKeys={cashCmp.keys} unassigned={unassigned} cash={cash} setCash={setCash} results={cashCmp.cmp.funds} />}
          {positions.length > 0 && <PricePanel needs={needs} prices={prices} setPrice={setPrice} />}
          {result && <ReportPanel result={result} holdings={positions.map((p) => holdings[p.key]!)} cash={cashForReport}
            extra={[['Hatch dividend gross-up (withholding assumed)', HATCH_GROSS_UP], ['Cash funds', cash.include ? `included (${cash.treatment})` : 'excluded (your assumption)']]} />}
        </>
      )}
      <footer>
        <p>Open source (Apache-2.0). Zero data retention: see PRIVACY.md and AUDIT.md in the repository. Exchange rates: Reserve Bank of New Zealand.</p>
      </footer>
    </main>
  );
}
