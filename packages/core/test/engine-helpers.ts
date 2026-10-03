import { FxTable, type FifClass, type PriceInput, type Txn, type TxnType } from '../src/index';

let n = 0;
export function tx(p: { sym?: string; type: TxnType; date: string; qty: string; amount?: string; price?: string; ccy?: string; nzdValue?: string; fx?: string; nzDate?: string; gross?: string; wht?: string; fee?: string }): Txn {
  const sym = p.sym ?? 'COA';
  const ccy = p.ccy ?? 'NZD';
  const qty = p.qty;
  const amount = p.amount ?? '0';
  const neg = p.type === 'BUY' || p.type === 'DRP' ? '-' : '';
  return {
    id: `t${++n}`, source: 'manual', sourceRef: `r${n}`, account: 'manual:test', instrumentKey: `${sym}:US`, symbol: sym, exchange: 'NASDAQ',
    name: `${sym} Corp`, assetClass: 'share', type: p.type, exchangeDate: p.date, nzDate: p.nzDate ?? p.date, qty, price: p.price ?? '',
    currency: ccy, fee: p.fee ?? '0', feeCcy: ccy, cashAmount: amount === '0' ? '0' : `${neg}${amount}`,
    ...(p.fx ? { fxForeignPerNzd: p.fx } : {}), fxSource: p.fx ? 'sharesight_trade' : 'none', ...(p.nzdValue ? { nzdValue: p.nzdValue } : {}),
    ...(p.type === 'DIVIDEND' ? { dividend: { gross: p.gross ?? '0', wht: p.wht ?? '0', net: '0' } } : {}),
    provenance: [], flags: [],
  };
}

/** A tiny FX table: USD at a fixed 0.5 USD per NZD every day of 2024-2026. */
export function fixedFx(rate = 0.5): FxTable {
  const dates: string[] = [];
  const d = new Date(Date.UTC(2024, 0, 1));
  while (d.getUTCFullYear() < 2027) { dates.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return new FxTable({ source: 'test', published: '2026-12-31', seriesIds: { USD: 'TEST' }, dates, rates: { USD: dates.map(() => rate) } });
}

export const nzdPrice = (price: string): PriceInput => ({ price, currency: 'NZD', source: 'test' });
export const fif = (...keys: string[]): Record<string, FifClass> => Object.fromEntries(keys.map((k) => [`${k}:US`, 'fif' as FifClass]));
