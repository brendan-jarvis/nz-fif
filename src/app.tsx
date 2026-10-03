import { useState } from 'preact/hooks';
import { readFiles, type LoadedFile } from './io/readFile';

export const DISCLAIMER =
  'Not tax advice. nz-fif is a calculation aid. It does not decide your tax residence, ' +
  'whether an interest is a FIF, whether an exemption applies, or which method you must use.';

export function App() {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  return (
    <main>
      <header>
        <h1>nz-fif</h1>
        <p class="tagline">NZ foreign investment fund (FIF) calculator. Everything runs in this tab.</p>
        <p class="disclaimer" data-testid="disclaimer">{DISCLAIMER}</p>
      </header>
      <section>
        <h2>1. Load your exports</h2>
        <p>Your files are read into this tab's memory only. They are never uploaded or stored.</p>
        <input
          type="file"
          multiple
          accept=".csv,.xlsx"
          data-testid="file-input"
          onChange={async (e) => {
            const input = e.currentTarget as HTMLInputElement;
            if (input.files) setFiles(await readFiles(input.files));
          }}
        />
        <ul data-testid="file-list">
          {files.map((f) => (
            <li key={f.name}>
              {f.name} ({f.size} bytes)
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
