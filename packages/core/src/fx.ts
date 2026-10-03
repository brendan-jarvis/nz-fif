// Exchange rates. Two modes (PLAN §6.3):
//  - 'rbnz': RBNZ B1 actual daily rate (bundled snapshot) for every conversion.
//  - 'trade': Sharesight per-trade `Exch. Rate` / `Value` for trades ("match
//    mode"); RBNZ for market values and anything without a trade rate.
// Rates are quoted as foreign units per 1 NZD, like RBNZ and Sharesight.
import { Decimal, ONE } from './decimal';
import { addDays } from './dates';

export type FxMode = 'rbnz' | 'trade';

export interface FxTableJson {
  source: string;
  published: string;
  seriesIds: Record<string, string>;
  dates: string[];
  rates: Record<string, Array<number | null>>;
}

export interface FxQuote {
  currency: string;
  /** Foreign units per 1 NZD. */
  foreignPerNzd: Decimal;
  /** Date of the rate actually used (walks back over weekends/holidays). */
  rateDate: string;
  requestedDate: string;
  source: string;
}

/** How far back we walk for a missing day (weekends, NZ and UK holidays). */
export const MAX_WALK_BACK_DAYS = 7;

export class FxTable {
  private readonly index = new Map<string, number>();
  constructor(private readonly data: FxTableJson, private readonly overrides = new Map<string, Decimal>()) {
    data.dates.forEach((d, i) => this.index.set(d, i));
  }

  get published(): string { return this.data.published; }
  get currencies(): string[] { return Object.keys(this.data.rates); }
  get firstDate(): string { return this.data.dates[0] ?? ''; }
  get lastDate(): string { return this.data.dates[this.data.dates.length - 1] ?? ''; }

  /** A user-entered rate (e.g. IRD rate or Sharesight report rate) wins for that currency and date. */
  withOverride(currency: string, date: string, foreignPerNzd: Decimal): FxTable {
    const o = new Map(this.overrides);
    o.set(`${currency}|${date}`, foreignPerNzd);
    return new FxTable(this.data, o);
  }

  /** RBNZ rate on `date`, or the last published rate within MAX_WALK_BACK_DAYS before it. */
  quote(currency: string, date: string): FxQuote | null {
    if (currency === 'NZD') return { currency, foreignPerNzd: ONE, rateDate: date, requestedDate: date, source: 'NZD' };
    const o = this.overrides.get(`${currency}|${date}`);
    if (o) return { currency, foreignPerNzd: o, rateDate: date, requestedDate: date, source: 'user override' };
    const series = this.data.rates[currency];
    if (!series) return null;
    for (let back = 0; back <= MAX_WALK_BACK_DAYS; back++) {
      const d = addDays(date, -back);
      const i = this.index.get(d);
      if (i === undefined) continue;
      const v = series[i];
      if (v === null || v === undefined) continue;
      return {
        currency, foreignPerNzd: new Decimal(String(v)), rateDate: d, requestedDate: date,
        source: `RBNZ B1 ${this.data.seriesIds[currency] ?? currency} ${d}`,
      };
    }
    return null;
  }

  /** NZD per 1 unit of foreign currency. */
  nzdPerUnit(currency: string, date: string): Decimal | null {
    const q = this.quote(currency, date);
    return q ? ONE.div(q.foreignPerNzd) : null;
  }
}
