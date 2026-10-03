// Normalised transaction schema (PLAN §4). All amounts and quantities are
// decimal strings so nothing is lost to floating point.

export type Source = 'sharesies' | 'hatch' | 'sharesight' | 'manual';
export type AssetClass = 'share' | 'etf' | 'cash_mmf' | 'crypto' | 'other';
export type TxnType =
  | 'BUY' | 'SELL' | 'DRP' | 'SPLIT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'OPENING'
  | 'DIVIDEND' | 'INTEREST' | 'CASH';
export type FxSource = 'sharesight_trade' | 'none';

export interface DividendDetail {
  gross: string;
  wht: string;
  net: string;
  /** Withholding rate used to gross up a net-only amount (flagged), if any. */
  grossUpRate?: string;
  perShare?: string;
}

export interface Txn {
  id: string;
  source: Source;
  /** Broker trade ID, or `<file>#<row>` for row-based exports. */
  sourceRef: string;
  account: string;
  instrumentKey: string;
  symbol: string;
  exchange: string;
  name: string;
  assetClass: AssetClass;
  type: TxnType;
  tsUtc?: string;
  /** Trade date on the exchange's own calendar (Sharesight's date basis). */
  exchangeDate: string;
  /** Trade date in New Zealand (the legal income-year boundary). */
  nzDate: string;
  /** Signed change in units held (+ buy, − sell, ± split delta). Never rounded. */
  qty: string;
  /** Price per unit in `currency` ('' if not applicable). */
  price: string;
  currency: string;
  fee: string;
  feeCcy: string;
  /** Signed cash effect in `currency`, including fees (− for buys). */
  cashAmount: string;
  /** Sharesight `Exch. Rate`: units of `currency` per 1 NZD. */
  fxForeignPerNzd?: string;
  fxSource: FxSource;
  /** Sharesight `Value` (NZD, + buys / − sells, as exported). */
  nzdValue?: string;
  /** For SPLIT: units after / units before, when known. */
  splitRatio?: string;
  dividend?: DividendDetail;
  provenance: string[];
  flags: string[];
}

export type FileKind = 'sharesies' | 'hatch' | 'alltrades' | 'unknown';

export interface ParseResult {
  kind: FileKind;
  fileName: string;
  txns: Txn[];
  warnings: string[];
  /** Counts for the UI and for golden tests. */
  stats: Record<string, number>;
}

export const TRADE_TYPES: ReadonlySet<TxnType> = new Set(['BUY', 'SELL', 'DRP']);
export const ACQUISITION_TYPES: ReadonlySet<TxnType> = new Set(['BUY', 'DRP', 'OPENING', 'TRANSFER_IN']);
export const DISPOSAL_TYPES: ReadonlySet<TxnType> = new Set(['SELL', 'TRANSFER_OUT']);
