// Runs the parser in a same-origin module Web Worker (CSP worker-src 'self').
import type { LoadedFile } from './io/readFile';
import type { ParseRequest, ParseResponse } from './parseTypes';

export function parseInWorker(files: LoadedFile[], hatchGrossUpRate = '0.15'): Promise<ParseResponse> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<ParseResponse>) => {
      resolve(ev.data);
      worker.terminate();
    };
    worker.onerror = (ev) => {
      resolve({ ok: false, error: ev.message || 'parser crashed' });
      worker.terminate();
    };
    const req: ParseRequest = { files: files.map((f) => ({ name: f.name, bytes: f.bytes.slice(0) })), hatchGrossUpRate };
    worker.postMessage(req, req.files.map((f) => f.bytes));
  });
}
