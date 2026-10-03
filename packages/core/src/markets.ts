// Exchange codes and instrument identity.

/** Aliases: the same venue under different names in different exports. */
const EXCHANGE_ALIASES: Record<string, string> = {
  CBOE: 'BATS', // Sharesies says CBOE, Sharesight says BATS (Cboe BZX)
  BZX: 'BATS',
  'NYSE ARCA': 'NYSEARCA',
  ARCA: 'NYSEARCA',
  NZE: 'NZX',
  XNZE: 'NZX',
  XASX: 'ASX',
};

export const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'BATS', 'NYSEARCA', 'NYSEAMERICAN', 'AMEX', 'OTC', 'US']);
export const CRYPTO_MARKETS = new Set(['CRYPTO']);

export function canonicalExchange(raw: string): string {
  const up = raw.trim().toUpperCase();
  return EXCHANGE_ALIASES[up] ?? up;
}

/** Dated ticker renames: [old, new, effective date]. */
export const TICKER_ALIASES: Array<{ from: string; to: string; from_date: string }> = [
  { from: 'SQ', to: 'XYZ', from_date: '2025-01-21' }, // Block Inc
  { from: 'FB', to: 'META', from_date: '2022-06-09' },
];

export function canonicalSymbol(raw: string): string {
  const up = raw.trim().toUpperCase();
  const alias = TICKER_ALIASES.find((a) => a.from === up);
  return alias ? alias.to : up;
}

/** Instrument key used across brokers: SYMBOL with US venues pooled. */
export function instrumentKey(symbol: string, exchange: string): string {
  const ex = canonicalExchange(exchange);
  const venue = US_EXCHANGES.has(ex) ? 'US' : ex || 'UNKNOWN';
  return `${canonicalSymbol(symbol)}:${venue}`;
}

export function isUsExchange(exchange: string): boolean {
  return US_EXCHANGES.has(canonicalExchange(exchange));
}
