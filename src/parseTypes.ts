import type { MergeResult, ParseResult } from '@nz-fif/core';

export interface ParseRequest {
  files: { name: string; bytes: ArrayBuffer }[];
  hatchGrossUpRate: string;
}

export type ParseResponse =
  | { ok: true; results: ParseResult[]; txnCountByFile: number[]; merged: MergeResult }
  | { ok: false; error: string };
