// Logic for the entire server side of nz-fif (entry point: worker/price.ts): GET /api/price?symbol=X&date=YYYY-MM-DD.
//
// Privacy (PRIVACY.md): the request carries only a ticker and a date. Nothing is
// logged or stored except the public price itself, in the Cache API, under a key
// built only from symbol and date. No client headers, cookies or IP addresses are
// forwarded upstream. The browser always gets `no-store`, no CORS, no redirects.
//
// Free plan (README "Cloudflare free tier"): no bindings at all. At most two small
// upstream subrequests per cache miss; the transform is a few hundred bytes of JSON
// work, far inside the 10 ms CPU limit.

export interface Env {
  /** 'yahoo' (default) or 'off' (kill switch: every lookup returns 503). */
  PRICE_SOURCE?: string;
}

export interface Deps {
  fetch: typeof fetch;
  cache: Pick<Cache, 'match' | 'put'>;
  now: () => Date;
}

export const SYMBOL_RE = /^[A-Z0-9]{1,10}([.-][A-Z0-9]{1,4})?$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_DATE = '2000-01-01';
export const CACHE_TTL_S = 7 * 24 * 3600;
export const NEGATIVE_TTL_S = 3600;
/** Per-isolate upstream budget (a safety valve, not a security control). */
export const UPSTREAM_PER_MINUTE = 60;
const UA = 'nz-fif price lookup (+https://github.com/nz-fif)';
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';

export interface PriceResponse {
  symbol: string;
  requestedDate: string;
  tradingDate: string;
  currency: string;
  exchangeTimezone: string;
  /** Yahoo's close (adjusted backwards for later splits). */
  close: number;
  /** The price actually traded that day: close × Π(split ratios after tradingDate). */
  rawClose: number;
  splitsAfter: Array<{ date: string; ratio: string }>;
  currencyNote?: string;
  source: string;
}

const BROWSER_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

function reply(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BROWSER_HEADERS, ...extra } });
}

/** Real calendar date between MIN_DATE and today (NZ is up to 14 h ahead of UTC). */
export function validDate(d: string, now: Date): boolean {
  if (!DATE_RE.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) return false;
  const latest = new Date(now.getTime() + 14 * 3600 * 1000).toISOString().slice(0, 10);
  return d >= MIN_DATE && d <= latest;
}

function dayUnix(d: string, offsetDays = 0): number {
  return Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000) + offsetDays * 86400;
}

const budget = { windowStart: 0, used: 0 };
const memo = new Map<string, { status: number; body: unknown }>();
const MEMO_MAX = 500;

/** Test hook: reset per-isolate state. */
export function _resetState(): void {
  budget.windowStart = 0; budget.used = 0; memo.clear();
}

function takeBudget(now: Date, n: number): boolean {
  const t = now.getTime();
  if (t - budget.windowStart >= 60_000) { budget.windowStart = t; budget.used = 0; }
  if (budget.used + n > UPSTREAM_PER_MINUTE) return false;
  budget.used += n;
  return true;
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { currency?: string; exchangeTimezoneName?: string; symbol?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      events?: { splits?: Record<string, { date: number; numerator: number; denominator: number }> };
    }> | null;
    error?: { code?: string } | null;
  };
}

async function upstream(deps: Deps, url: string): Promise<YahooChart | 'not_found' | 'error'> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      redirect: 'error',
      // Day-stable URLs, so Cloudflare's edge cache absorbs repeats too.
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit);
  } catch {
    return 'error';
  }
  if (res.status === 404) return 'not_found';
  if (!res.ok) return 'error';
  try {
    return (await res.json()) as YahooChart;
  } catch {
    return 'error';
  }
}

export async function lookup(symbol: string, date: string, deps: Deps): Promise<{ status: number; body: unknown }> {
  // Call 1: daily bars around the date. Call 2: split events from the date to today (coarse bars, small).
  const today = deps.now().toISOString().slice(0, 10);
  const bars = `${YAHOO}${encodeURIComponent(symbol)}?period1=${dayUnix(date, -10)}&period2=${dayUnix(date, 2)}&interval=1d&includePrePost=false`;
  const splits = `${YAHOO}${encodeURIComponent(symbol)}?period1=${dayUnix(date, -1)}&period2=${dayUnix(today, 1)}&interval=3mo&events=split&includePrePost=false`;
  const a = await upstream(deps, bars);
  if (a === 'not_found' || a !== 'error' && (a.chart?.error || !a.chart?.result?.[0])) return { status: 404, body: { error: 'symbol_not_found' } };
  if (a === 'error') return { status: 502, body: { error: 'upstream_unavailable' } };
  const r = a.chart!.result![0]!;
  const tz = r.meta?.exchangeTimezoneName ?? 'America/New_York';
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return { status: 502, body: { error: 'upstream_bad_timezone' } };
  }
  const ts = r.timestamp ?? [];
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  let idx = -1;
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === 'number' && Number.isFinite(c) && fmt.format(new Date(ts[i]! * 1000)) <= date) idx = i;
  }
  if (idx < 0) return { status: 404, body: { error: 'no_price_on_or_before_date' } };
  const tradingDate = fmt.format(new Date(ts[idx]! * 1000));
  const b = await upstream(deps, splits);
  if (b === 'error' || b === 'not_found') return { status: 502, body: { error: 'upstream_unavailable' } };
  const ev = b.chart?.result?.[0]?.events?.splits ?? {};
  const splitsAfter: Array<{ date: string; ratio: string }> = [];
  let factor = 1;
  for (const s of Object.values(ev).sort((x, y) => x.date - y.date)) {
    const d = fmt.format(new Date(s.date * 1000));
    if (d > tradingDate && s.numerator > 0 && s.denominator > 0) {
      factor *= s.numerator / s.denominator;
      splitsAfter.push({ date: d, ratio: `${s.numerator}:${s.denominator}` });
    }
  }
  let currency = r.meta?.currency ?? '';
  let close = closes[idx]!;
  let currencyNote: string | undefined;
  if (currency === 'GBp' || currency === 'GBX') {
    currency = 'GBP';
    close = close / 100;
    currencyNote = 'Yahoo quotes this listing in pence; converted to pounds.';
  }
  const body: PriceResponse = {
    symbol, requestedDate: date, tradingDate, currency, exchangeTimezone: tz,
    close, rawClose: Number((close * factor).toPrecision(12)), splitsAfter,
    ...(currencyNote ? { currencyNote } : {}),
    source: 'Yahoo Finance chart API (unofficial; check against your broker)',
  };
  return { status: 200, body };
}

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname !== '/api/price') return reply(404, { error: 'not_found' });
  if (req.method !== 'GET') return reply(405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  const keys = [...url.searchParams.keys()];
  const symbol = url.searchParams.get('symbol') ?? '';
  const date = url.searchParams.get('date') ?? '';
  if (keys.length !== 2 || !url.searchParams.has('symbol') || !url.searchParams.has('date')
    || !SYMBOL_RE.test(symbol) || !validDate(date, deps.now())) {
    return reply(400, { error: 'bad_request', expected: 'symbol=[A-Z0-9.-] and date=YYYY-MM-DD between 2000-01-01 and today' });
  }
  if ((env.PRICE_SOURCE ?? 'yahoo') === 'off') return reply(503, { error: 'lookups_disabled' });

  const id = `${symbol}/${date}`;
  const cacheKey = new Request(`https://cache.internal/v1/${id}`);
  const hit = memo.get(id);
  if (hit) return reply(hit.status, hit.body);
  const cached = await deps.cache.match(cacheKey);
  if (cached) {
    const body: unknown = await cached.json();
    return reply(cached.headers.get('X-Status') === '404' ? 404 : 200, body);
  }
  if (!takeBudget(deps.now(), 2)) return reply(429, { error: 'busy_try_later_or_enter_manually' }, { 'Retry-After': '60' });
  const result = await lookup(symbol, date, deps);
  if (result.status === 200 || result.status === 404) {
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
    memo.set(id, result);
    const ttl = result.status === 200 ? CACHE_TTL_S : NEGATIVE_TTL_S;
    await deps.cache.put(cacheKey, new Response(JSON.stringify(result.body), {
      status: 200, // Store negatives as 200 + X-Status so the Cache API keeps them (briefly).
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}`, 'X-Status': String(result.status) },
    }));
  }
  return reply(result.status, result.body);
}
