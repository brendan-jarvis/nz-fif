// Proves the ESLint privacy bans actually fire (PLAN §3.9).
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function errors(code: string, filePath: string): Promise<string[]> {
  const [res] = await eslint.lintText(code, { filePath });
  return (res?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? m.message);
}

const APP = 'src/feature/example.ts';
const CORE = 'packages/core/src/example.ts';

describe('ESLint zero-retention bans', () => {
  const banned = [
    'fetch("/x");',
    'window.fetch("/x");',
    'globalThis["fetch"]("/x");',
    'new XMLHttpRequest();',
    'new WebSocket("wss://x");',
    'new EventSource("/x");',
    'navigator.sendBeacon("/x", "");',
    'localStorage.setItem("a", "b");',
    'window.sessionStorage.getItem("a");',
    'indexedDB.open("x");',
    'document.cookie = "a=b";',
    'navigator.serviceWorker.register("/sw.js");',
    'caches.open("x");',
    'importScripts("/x.js");',
    'new RTCPeerConnection();',
  ];
  for (const code of banned) {
    it(`bans in app: ${code}`, async () => expect(await errors(code, APP)).not.toHaveLength(0));
    it(`bans in core: ${code}`, async () => expect(await errors(code, CORE)).not.toHaveLength(0));
  }

  it('allows fetch only in src/net/priceClient.ts', async () => {
    expect(await errors('export const f = () => fetch("/api/price");', 'src/net/priceClient.ts')).toEqual([]);
    expect(await errors('export const f = () => localStorage.getItem("x");', 'src/net/priceClient.ts')).not.toHaveLength(0);
  });

  it('bans console and storage bindings in the Worker', async () => {
    expect(await errors('console.log("x");', 'worker/price.ts')).toContain('no-console');
    expect(await errors('export type E = { DB: D1Database };', 'worker/price.ts')).not.toHaveLength(0);
    expect(await errors('export const f = (env: { KV: unknown }) => env.KV;', 'worker/price.ts')).not.toHaveLength(0);
    expect(await errors('export const f = (env: { PRICE_SOURCE: string }) => env.PRICE_SOURCE;', 'worker/price.ts')).toEqual([]);
  });
});
