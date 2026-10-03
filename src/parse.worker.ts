/// <reference lib="webworker" />
// Parses uploaded exports off the main thread. Receives file bytes by
// postMessage (transferred, not copied) and returns normalised transactions.
// No network, no storage: this worker only computes.
import { mergeSources, parseFile, type ParseResult } from '@nz-fif/core';
import type { ParseRequest, ParseResponse } from './parseTypes';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<ParseRequest>) => {
  const req = ev.data;
  try {
    const results: ParseResult[] = req.files.map((f) => {
      try {
        return parseFile(f.name, f.bytes, { hatch: { dividendGrossUpRate: req.hatchGrossUpRate } });
      } catch (e) {
        return { kind: 'unknown', fileName: f.name, txns: [], warnings: [(e as Error).message], stats: {} };
      }
    });
    const merged = mergeSources(results);
    const res: ParseResponse = { ok: true, results: results.map((r) => ({ ...r, txns: [] })), txnCountByFile: results.map((r) => r.txns.length), merged };
    ctx.postMessage(res);
  } catch (e) {
    const res: ParseResponse = { ok: false, error: (e as Error).message };
    ctx.postMessage(res);
  }
};
