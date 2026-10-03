import type { AssetClass } from '../types';
import { canonicalExchange, isUsExchange } from '../markets';
import { TZ_AUCKLAND, TZ_NEW_YORK } from '../dates';

/** Known money market fund tickers (PLAN §5 rule 2). */
export const MMF_TICKERS = new Set(['DAGXX', 'DARXX', 'SWVXX', 'SPAXX', 'VMFXX', 'FDRXX', 'SNOXX', 'SNVXX', 'VUSXX', 'TTTXX']);

export function inferAssetClass(symbol: string, exchange: string, name: string, description = ''): AssetClass {
  const ex = canonicalExchange(exchange);
  if (ex === 'CRYPTO') return 'crypto';
  if (MMF_TICKERS.has(symbol.toUpperCase()) || /money market/i.test(`${name} ${description}`)) return 'cash_mmf';
  if (ex === 'OTHER') return 'other';
  if (/\bETF\b|ETF Trust|Exchange[- ]Traded|\bFund\b|Trust\b.*Shares/i.test(name)) return 'etf';
  return 'share';
}

/** IANA time zone for an exchange's trading calendar. */
export function exchangeTimeZone(exchange: string): string {
  const ex = canonicalExchange(exchange);
  if (isUsExchange(ex)) return TZ_NEW_YORK;
  switch (ex) {
    case 'NZX': return TZ_AUCKLAND;
    case 'ASX': return 'Australia/Sydney';
    case 'LSE': return 'Europe/London';
    case 'TSX': return 'America/Toronto';
    case 'HKEX': return 'Asia/Hong_Kong';
    case 'XETRA': return 'Europe/Berlin';
    default: return TZ_AUCKLAND;
  }
}

export function excelSerialToIso(n: number): string {
  // Excel 1900 date system (with the 1900 leap-year bug): serial 25569 = 1970-01-01.
  const ms = Math.round((n - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}
