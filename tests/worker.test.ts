// Unit tests for worker/price.ts with an injected fake upstream and cache.
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { handle, _resetState, UPSTREAM_PER_MINUTE, type Deps, type PriceResponse } from '../worker/price';

const NOW = new Date('2026-10-03T10:00:00Z');

function fakeDeps(opts: { fail?: boolean } = {}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const store = new Map<string, Response>();
  const deps: Deps = {
    now: () => NOW,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (opts.fail) return new Response('busy', { status: 500 });
      const u = new URL(url);
      const sym = decodeURIComponent(u.pathname.split('/').pop()!);
      if (sym === 'NOPE') return new Response(readFileSync('fixtures/yahoo/NOPE.notfound.json'), { status: 404 });
      const kind = u.searchParams.get('interval') === '1d' ? 'bars' : 'splits';
      return new Response(readFileSync(`fixtures/yahoo/${sym}.${kind}.json`), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    cache: {
      match: (async (req: RequestInfo | URL) => store.get(String(req instanceof Request ? req.url : req))?.clone()) as Cache['match'],
      put: (async (req: RequestInfo | URL, res: Response) => { store.set(String(req instanceof Request ? req.url : req), res.clone()); }) as Cache['put'],
    },
  };
  return { deps, calls, store };
}

const get = (q: string, deps: Deps, env = {}, init: RequestInit = {}) => handle(new Request(`https://nz-fif.example.workers.dev/api/price${q}`, init), env, deps);

beforeEach(() => _resetState());

function expectBrowserHeaders(res: Response) {
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  expect([...res.headers.keys()].filter((k) => k.startsWith('access-control-'))).toEqual([]);
  expect(res.headers.has('set-cookie')).toBe(false);
}

describe('validation', () => {
  const bad = [
    '', '?symbol=AAPL', '?date=2025-03-31', '?symbol=aapl&date=2025-03-31', '?symbol=AAPL&date=2025-3-31',
    '?symbol=AAPL&date=2025-02-30', '?symbol=AAPL&date=1999-12-31', '?symbol=AAPL&date=2026-10-05',
    '?symbol=AAPL&date=2025-03-31&x=1', '?symbol=AAPL&symbol=MSFT&date=2025-03-31', '?symbol=TOOLONGSYMBOL&date=2025-03-31',
    '?symbol=BRK.B.C&date=2025-03-31', '?symbol=%3Cscript%3E&date=2025-03-31', '?symbol=AAPL&date=2025-03-31%0A',
  ];
  for (const q of bad) {
    it(`rejects ${q || '(no query)'} with 400 and makes no upstream call`, async () => {
      const { deps, calls } = fakeDeps();
      const res = await get(q, deps);
      expect(res.status).toBe(400);
      expectBrowserHeaders(res);
      expect(calls).toEqual([]);
    });
  }
  it('rejects POST with 405 and other paths with 404', async () => {
    const { deps, calls } = fakeDeps();
    expect((await get('?symbol=AAPL&date=2025-03-31', deps, {}, { method: 'POST', body: 'x' })).status).toBe(405);
    expect((await handle(new Request('https://x.example/api/other'), {}, deps)).status).toBe(404);
    expect(calls).toEqual([]);
  });
  it('accepts today in New Zealand even when it is still yesterday in UTC', async () => {
    const { deps } = fakeDeps();
    const res = await get('?symbol=NOPE&date=2026-10-03', deps);
    expect(res.status).toBe(404);
  });
});

describe('lookups', () => {
  it('returns rawClose = close × later split ratios (TRPL 2:1 after the date)', async () => {
    const { deps, calls } = fakeDeps();
    const res = await get('?symbol=TRPL&date=2025-03-31', deps);
    expect(res.status).toBe(200);
    expectBrowserHeaders(res);
    const body = (await res.json()) as PriceResponse;
    expect(body).toMatchObject({ symbol: 'TRPL', tradingDate: '2025-03-31', currency: 'USD', exchangeTimezone: 'America/New_York', close: 33.8, rawClose: 67.6 });
    expect(body.splitsAfter).toEqual([{ date: '2025-11-24', ratio: '2:1' }]);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/TRPL?')).toBe(true);
      const h = new Headers(c.init?.headers);
      expect([...h.keys()].sort()).toEqual(['accept', 'user-agent']); // no client headers, cookies or IP forwarded
      expect(c.init?.redirect).toBe('error');
    }
  });

  it('walks back over a holiday (Good Friday) to the previous trading day', async () => {
    const { deps } = fakeDeps();
    const body = (await (await get('?symbol=ACME&date=2025-04-18', deps)).json()) as PriceResponse;
    expect(body.tradingDate).toBe('2025-04-17');
    expect(body.rawClose).toBe(body.close);
  });

  it('handles BRK-B, .AX (bar timestamps on the previous UTC day), .NZ and GBp → GBP', async () => {
    const { deps } = fakeDeps();
    const brk = (await (await get('?symbol=BRK-B&date=2026-03-31', deps)).json()) as PriceResponse;
    expect(brk.tradingDate).toBe('2026-03-31');
    const csl = (await (await get('?symbol=CSL.AX&date=2025-03-31', deps)).json()) as PriceResponse;
    expect(csl).toMatchObject({ tradingDate: '2025-03-31', currency: 'AUD', exchangeTimezone: 'Australia/Sydney' });
    const fph = (await (await get('?symbol=FPH.NZ&date=2025-03-30', deps)).json()) as PriceResponse;
    expect(fph).toMatchObject({ tradingDate: '2025-03-28', currency: 'NZD' });
    const vod = (await (await get('?symbol=VOD.L&date=2026-03-31', deps)).json()) as PriceResponse;
    expect(vod.currency).toBe('GBP');
    expect(vod.close).toBeLessThan(1);
    expect(vod.currencyNote).toMatch(/pence/);
  });

  it('caches by symbol and date only: a second request makes no upstream call', async () => {
    const { deps, calls, store } = fakeDeps();
    await get('?symbol=TRPL&date=2025-03-31', deps);
    _resetState(); // new isolate: in-memory memo gone, Cache API still warm
    const again = await get('?symbol=TRPL&date=2025-03-31', deps);
    expect(again.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect([...store.keys()]).toEqual(['https://cache.internal/v1/TRPL/2025-03-31']);
    expect(store.get('https://cache.internal/v1/TRPL/2025-03-31')!.headers.get('cache-control')).toBe('public, max-age=604800');
  });

  it('caches "not found" briefly and returns 404', async () => {
    const { deps, store } = fakeDeps();
    const res = await get('?symbol=NOPE&date=2025-03-31', deps);
    expect(res.status).toBe(404);
    _resetState();
    expect((await get('?symbol=NOPE&date=2025-03-31', deps)).status).toBe(404);
    expect(store.get('https://cache.internal/v1/NOPE/2025-03-31')!.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('returns 502 on upstream failure and caches nothing', async () => {
    const { deps, store } = fakeDeps({ fail: true });
    expect((await get('?symbol=TRPL&date=2025-03-31', deps)).status).toBe(502);
    expect(store.size).toBe(0);
  });

  it('kill switch PRICE_SOURCE=off returns 503 without calling upstream', async () => {
    const { deps, calls } = fakeDeps();
    const res = await get('?symbol=TRPL&date=2025-03-31', deps, { PRICE_SOURCE: 'off' });
    expect(res.status).toBe(503);
    expect(calls).toEqual([]);
  });

  it('per-isolate upstream budget returns 429 with Retry-After when exhausted', async () => {
    const { deps } = fakeDeps();
    const misses = UPSTREAM_PER_MINUTE / 2; // each cache miss reserves two subrequests
    for (let i = 0; i < misses; i++) {
      const d = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
      expect((await get(`?symbol=NOPE&date=${d}`, deps)).status).toBe(404);
    }
    const over = await get('?symbol=NOPE&date=2025-06-01', deps);
    expect(over.status).toBe(429);
    expect(over.headers.get('retry-after')).toBe('60');
    expect((await get('?symbol=NOPE&date=2024-01-01', deps)).status).toBe(404); // cached answers still flow
  });
});
