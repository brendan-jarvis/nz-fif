// Exact decimal arithmetic for money and quantities. Never use JS numbers for
// amounts: 0.1 + 0.2 !== 0.3. Quantities are never rounded.
import DecimalJs from 'decimal.js';

export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 40 });
export type Decimal = InstanceType<typeof Decimal>;

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/** Parse a decimal from a string/number; '' / null / undefined -> null. */
export function dec(v: unknown): Decimal | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    // String(v) is the shortest round-trip representation of the double the
    // spreadsheet stored, which is what the exporting app wrote.
    return new Decimal(String(v));
  }
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || s === '-' || /^n\/?a$/i.test(s)) return null;
  try {
    return new Decimal(s);
  } catch {
    return null;
  }
}

export function decOr0(v: unknown): Decimal {
  return dec(v) ?? ZERO;
}

/** Canonical string for storage in Txn: no exponent, no trailing zeros. */
export function s(d: Decimal): string {
  return d.toFixed();
}

/** Display rounding only (half-up to cents). */
export function money2(d: Decimal | null | undefined): string {
  return d ? d.toFixed(2) : 'n/a';
}

export function sum(xs: Iterable<Decimal>): Decimal {
  let t = ZERO;
  for (const x of xs) t = t.plus(x);
  return t;
}

export const QTY_EPSILON = new Decimal('1e-8');
export function isZeroQty(d: Decimal): boolean {
  return d.abs().lte(QTY_EPSILON);
}
