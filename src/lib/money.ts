/**
 * Money helpers. Amounts are integers in the currency's minor unit.
 */

const MINOR_UNIT_EXPONENT: Record<string, number> = {
  RWF: 0,
  UGX: 0,
  BIF: 0,
  KES: 2,
  TZS: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CNY: 2,
  AED: 2,
  ZAR: 2,
  CDF: 2,
};

export const SUPPORTED_CURRENCIES = Object.keys(MINOR_UNIT_EXPONENT);

export function minorExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency] ?? 2;
}

/** Convert a user-entered major amount (e.g. 12.5) into integer minor units. */
export function toMinor(major: number, currency: string): number {
  const exp = minorExponent(currency);
  return Math.round(major * 10 ** exp);
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** minorExponent(currency);
}

/**
 * Display conversion. Records are always stored in the household currency;
 * when the person picks another display currency, amounts in the household
 * currency are converted at the chosen rate only when they are shown.
 */
interface DisplayConversion {
  base: string;
  target: string;
  /** Units of `target` per 1 unit of `base` (major units). */
  rate: number;
}
let display: DisplayConversion | null = null;

export function setDisplayConversion(next: DisplayConversion | null): void {
  display = next && next.target !== next.base && next.rate > 0 ? next : null;
}

export function getDisplayConversion(): DisplayConversion | null {
  return display;
}

export function formatMoney(
  minor: number,
  currency = "RWF",
  opts: { compact?: boolean; sign?: boolean; raw?: boolean } = {},
): string {
  if (display && !opts.raw && currency === display.base) {
    const majorBase = minor / 10 ** minorExponent(currency);
    const target = display.target;
    return formatMoney(Math.round(majorBase * display.rate * 10 ** minorExponent(target)), target, { ...opts, raw: true });
  }
  const exp = minorExponent(currency);
  const major = minor / 10 ** exp;
  const abs = Math.abs(major);
  let body: string;
  if (opts.compact && abs >= 1_000_000) {
    body = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  } else if (opts.compact && abs >= 10_000) {
    body = `${Math.round(abs / 1000)}K`;
  } else {
    body = abs.toLocaleString("en-US", {
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    });
  }
  const sign = major < 0 ? "−" : opts.sign && major > 0 ? "+" : "";
  return `${sign}${currency} ${body}`;
}

/** Round an amount up to the next multiple of `increment` (micro-savings). */
export function roundUpTo(amount: number, increment: number): number {
  if (increment <= 0) return amount;
  return Math.ceil(amount / increment) * increment;
}
