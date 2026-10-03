import { useState } from 'preact/hooks';
import type { MergeResult, ParseResult } from '@nz-fif/core';
import type { LoadedFile } from './io/readFile';
import { parseInWorker } from './parseClient';
import { UploadPanel } from './components/UploadPanel';
import { ReconPanel } from './components/ReconPanel';
import { TxnTable } from './components/TxnTable';

export const DISCLAIMER =
  'Not tax advice. nz-fif is a calculation aid. It does not decide your tax residence, ' +
  'whether an interest is a FIF, whether an exemption applies, or which method you must use.';

export function App() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ParseResult[] | null>(null);
  const [counts, setCounts] = useState<number[]>([]);
  const [merged, setMerged] = useState<MergeResult | null>(null);

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
          <TxnTable txns={merged.txns} />
        </>
      )}
      <footer>
        <p>Open source (Apache-2.0). Zero data retention: see PRIVACY.md and AUDIT.md in the repository.</p>
      </footer>
    </main>
  );
}
