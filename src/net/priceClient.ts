// THE ONLY FILE IN THE APP ALLOWED TO CALL fetch (enforced by eslint.config.js
// and scripts/scan-bundle.ts). It sends exactly two things to our own
// same-origin route: a ticker symbol and a date. Never quantities, values,
// file contents, cookies, a referrer or a request body.

export const SYMBOL_RE = /^[A-Z0-9]{1,10}([.-][A-Z0-9]{1,4})?$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PriceSplit {
  date: string;
  numerator: number;
  denominator: number;
}

export interface PriceResult {
  symbol: string;
  requestedDate: string;
  tradingDate: string;
  currency: string;
  exchangeTimezone: string;
  /** Yahoo close: split-adjusted backwards. Shown for cross-checking only. */
  close: number;
  /** close x product of split ratios after tradingDate. FIF uses this. */
  rawClose: number;
  splitsAfter: PriceSplit[];
  source: string;
}

export type PriceOutcome =
  | { ok: true; price: PriceResult }
  | { ok: false; status: number; reason: string };

export function priceUrl(symbol: string, date: string): string {
  if (!SYMBOL_RE.test(symbol)) throw new Error(`Invalid symbol for lookup: ${symbol}`);
  if (!DATE_RE.test(date)) throw new Error(`Invalid date for lookup: ${date}`);
  // Both values are already restricted to [A-Z0-9.-] and digits, so the URL
  // is exactly /api/price?symbol=X&date=YYYY-MM-DD.
  return `/api/price?symbol=${symbol}&date=${date}`;
}

export async function fetchPrice(
  symbol: string,
  date: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PriceOutcome> {
  const url = priceUrl(symbol, date);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      redirect: 'error',
      mode: 'same-origin',
    });
  } catch {
    return { ok: false, status: 0, reason: 'network error' };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, reason: res.status === 429 ? 'rate limited' : `HTTP ${res.status}` };
  }
  const body = (await res.json()) as PriceResult;
  if (typeof body.rawClose !== 'number' || body.symbol !== symbol) {
    return { ok: false, status: res.status, reason: 'malformed response' };
  }
  return { ok: true, price: body };
}
