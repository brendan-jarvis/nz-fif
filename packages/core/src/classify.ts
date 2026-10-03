// FIF eligibility suggestions (PLAN §5). Suggestions only: the user decides, and
// every choice lands in the Assumptions table. ASX holdings are never silently exempted.
import type { FifClass } from './fif';
import { isUsExchange } from './markets';
import type { AssetClass } from './types';
import { MMF_TICKERS } from './parsers/common';

export const IRD_ASX_TOOL = 'https://www.ird.govt.nz/fif-australia-tool';

/**
 * ASX-listed Australian-resident companies confirmed exempt under s EX 31.
 * Deliberately EMPTY until a dated, sourced list is added: every ASX holding goes to Review.
 */
export const ASX_EXEMPT_LIST: { asOf: string | null; source: string | null; symbols: string[] } = { asOf: null, source: null, symbols: [] };

export interface HoldingRef {
  key: string;
  symbol: string;
  exchange: string;
  name: string;
  assetClass: AssetClass;
}

export interface Suggestion {
  fifClass: FifClass;
  rule: string;
  reason: string;
  caution?: string;
}

const TOKEN_NAME = /\b(token|coin|protocol|crypto|bitcoin|ethereum|staked|wrapped)\b/i;

export function suggestClass(h: HoldingRef): Suggestion {
  const ex = h.exchange.toUpperCase();
  if (h.key.startsWith('UNASSIGNED:')) {
    return { fifClass: 'excluded', rule: 'unassigned_dividend', reason: 'Dividend with no ticker in the broker file. Assign it to a holding in the cash-fund section, or leave it out.' };
  }
  if (ex === 'CRYPTO' || h.assetClass === 'crypto') {
    return { fifClass: 'not_fif', rule: 'crypto', reason: 'Crypto asset: not a FIF. IRD taxes crypto as property under the general rules (ird.govt.nz/cryptoassets).' };
  }
  if (ex === 'OTHER' && TOKEN_NAME.test(h.name)) {
    return { fifClass: 'not_fif', rule: 'crypto', reason: 'Unlisted ("OTHER" market) holding whose name looks like a crypto token: not a FIF.', caution: 'Check this really is a token and not a fund or company share.' };
  }
  if (MMF_TICKERS.has(h.symbol.toUpperCase()) || h.assetClass === 'cash_mmf') {
    return { fifClass: 'cash_mmf', rule: 'money_market', reason: 'Money market fund. Excluded by default as a user assumption, not an IRD exemption (see the cash-fund note).' };
  }
  if (ex === 'NZX') {
    return { fifClass: 'not_fif', rule: 'nzx', reason: 'NZX-listed: NZ-resident companies are not FIFs.', caution: 'Some NZX listings are foreign-domiciled funds or companies (for example some ETFs); check the issuer.' };
  }
  if (ex === 'ASX') {
    if (ASX_EXEMPT_LIST.symbols.includes(h.symbol.toUpperCase())) {
      return { fifClass: 'not_fif', rule: 'asx_list', reason: `On the bundled ASX exemption list (${ASX_EXEMPT_LIST.asOf ?? 'undated'}).` };
    }
    return { fifClass: 'review', rule: 'asx_review', reason: `ASX-listed: exempt only if an Australian-resident company on the official list that keeps a franking account and is not stapled (s EX 31). Check with IRD's tool: ${IRD_ASX_TOOL}` };
  }
  if (ex === '' || ex === 'OTHER' || ex === 'UNKNOWN' || ex === 'HATCH') {
    return { fifClass: 'review', rule: 'unknown_market', reason: 'Market unknown: decide whether this is a foreign company, fund or something else.' };
  }
  return { fifClass: 'fif', rule: 'foreign_listed', reason: `Listed on a foreign exchange (${ex}): a foreign company or fund, so an attributing FIF interest unless an exemption applies.` };
}

const SUFFIX: Record<string, string> = { ASX: '.AX', NZX: '.NZ', LSE: '.L', TSX: '.TO', HKEX: '.HK', XETRA: '.DE' };

/** Yahoo symbol for a holding (editable in the review table). */
export function yahooSymbol(symbol: string, exchange: string): string {
  const s = symbol.toUpperCase().trim();
  const ex = exchange.toUpperCase();
  if (isUsExchange(ex)) return s.replace(/\./g, '-');
  const suf = SUFFIX[ex];
  return suf ? `${s}${suf}` : s;
}
