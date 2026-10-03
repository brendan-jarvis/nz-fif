// assumptions.json: the user's review decisions, downloadable and re-uploadable.
// Contains tickers, classes, options and prices; never quantities or amounts from files.
import type { CalcOptions, FifClass, PriceInput } from './fif';

export interface HoldingAssumption {
  key: string;
  fifClass: FifClass;
  source: 'rule' | 'user';
  rule: string;
  reason: string;
  yahooSymbol: string;
  note?: string;
}

export interface Assumptions {
  format: 'nz-fif-assumptions';
  version: 1;
  year: number;
  holdings: HoldingAssumption[];
  options: Partial<CalcOptions>;
  cashFunds: { include: boolean; treatment: 'cv' | 'same'; balances: Record<string, { openingBalance: string; closingBalance: string; exitDate?: string }>; dividendAssignments: Record<string, string> };
  hatchGrossUpRate: string;
  prices: Record<string, { opening?: PriceInput; closing?: PriceInput }>;
}

const CLASSES: FifClass[] = ['fif', 'not_fif', 'cash_mmf', 'excluded', 'review'];
const KEY_RE = /^[A-Z0-9.\-_]{1,24}:[A-Z0-9_]{1,12}$/;
const NUM_RE = /^-?\d{1,15}(\.\d{1,20})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function price(v: unknown): PriceInput | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const p = str(o.price, 40);
  if (!NUM_RE.test(p)) return undefined;
  const date = str(o.date, 10);
  return { price: p, currency: str(o.currency, 3).toUpperCase(), source: str(o.source, 200) || 'assumptions file', ...(DATE_RE.test(date) ? { date } : {}) };
}

/** Parse and sanitise an uploaded assumptions file. Throws on the wrong format. */
export function parseAssumptions(text: string): Assumptions {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (raw.format !== 'nz-fif-assumptions' || raw.version !== 1) throw new Error('Not an nz-fif assumptions file (format/version)');
  const year = Number(raw.year);
  if (!Number.isInteger(year) || year < 2008 || year > 2100) throw new Error('Bad year');
  const holdings: HoldingAssumption[] = [];
  for (const h of Array.isArray(raw.holdings) ? raw.holdings : []) {
    const o = h as Record<string, unknown>;
    const key = str(o.key, 40);
    const fifClass = str(o.fifClass, 10) as FifClass;
    if (!KEY_RE.test(key) || !CLASSES.includes(fifClass)) continue;
    holdings.push({ key, fifClass, source: o.source === 'user' ? 'user' : 'rule', rule: str(o.rule, 40), reason: str(o.reason), yahooSymbol: str(o.yahooSymbol, 16).toUpperCase(), ...(o.note ? { note: str(o.note) } : {}) });
  }
  const opt = (raw.options ?? {}) as Record<string, unknown>;
  const options: Partial<CalcOptions> = {};
  if (opt.dateBasis === 'exchange' || opt.dateBasis === 'nz') options.dateBasis = opt.dateBasis;
  if (opt.fxMode === 'rbnz' || opt.fxMode === 'trade') options.fxMode = opt.fxMode;
  if (opt.qsGainCost === 'average' || opt.qsGainCost === 'lot') options.qsGainCost = opt.qsGainCost;
  if (typeof opt.includeDividends === 'boolean') options.includeDividends = opt.includeDividends;
  if (typeof opt.marginalRate === 'string' && /^0(\.\d{1,4})?$/.test(opt.marginalRate)) options.marginalRate = opt.marginalRate;
  const cf = (raw.cashFunds ?? {}) as Record<string, unknown>;
  const balances: Assumptions['cashFunds']['balances'] = {};
  for (const [k, v] of Object.entries((cf.balances ?? {}) as Record<string, Record<string, unknown>>)) {
    if (!KEY_RE.test(k)) continue;
    const ob = str(v.openingBalance, 30), cb = str(v.closingBalance, 30), ed = str(v.exitDate, 10);
    balances[k] = { openingBalance: NUM_RE.test(ob) ? ob : '0', closingBalance: NUM_RE.test(cb) ? cb : '0', ...(DATE_RE.test(ed) ? { exitDate: ed } : {}) };
  }
  const dividendAssignments: Record<string, string> = {};
  for (const [k, v] of Object.entries((cf.dividendAssignments ?? {}) as Record<string, unknown>)) {
    if (/^[\w:#.-]{1,120}$/.test(k) && KEY_RE.test(str(v, 40))) dividendAssignments[k] = str(v, 40);
  }
  const prices: Assumptions['prices'] = {};
  for (const [k, v] of Object.entries((raw.prices ?? {}) as Record<string, Record<string, unknown>>)) {
    if (!KEY_RE.test(k)) continue;
    const opening = price(v.opening), closing = price(v.closing);
    prices[k] = { ...(opening ? { opening } : {}), ...(closing ? { closing } : {}) };
  }
  const gross = str(raw.hatchGrossUpRate, 6);
  return {
    format: 'nz-fif-assumptions', version: 1, year, holdings, options,
    cashFunds: { include: cf.include === true, treatment: cf.treatment === 'same' ? 'same' : 'cv', balances, dividendAssignments },
    hatchGrossUpRate: /^0(\.\d{1,4})?$/.test(gross) ? gross : '0.15',
    prices,
  };
}

export function serializeAssumptions(a: Assumptions): string {
  return JSON.stringify(a, null, 2) + '\n';
}
