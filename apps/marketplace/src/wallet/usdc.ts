/* USDC is an integer of base units on chain, six decimal places for the coin
   this book settles in, and the display layer knows nothing about that until
   the deployment tells it. So every figure the wallet shows passes through
   here rather than through the ledger's two-decimal `formatMoney`, which keys
   its decimals off an ISO currency code the coin does not have. */

const groupingByLocale = new Map<string, Intl.NumberFormat>();

function grouping(locale: string): Intl.NumberFormat {
  const cached = groupingByLocale.get(locale);
  if (cached !== undefined) {
    return cached;
  }
  const format = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 });
  groupingByLocale.set(locale, format);
  return format;
}

function readerLocale(): string {
  return typeof navigator === 'undefined' ? 'en-US' : navigator.language;
}

const displayFractionDigits = 2;

/* Two decimal places, truncated rather than rounded, so a balance is never
   shown as more than the wallet holds. The value keeps its full precision; only
   the reading is shortened. */
export function formatUsdc(baseUnits: bigint, decimals: number, locale = readerLocale()): string {
  return `USDC ${formatUsdcAmount(baseUnits, decimals, locale)}`;
}

/* The figure alone, for the coin mark to stand in front of on a screen. The
   code stays on the string above for anywhere that reads it out. */
export function formatUsdcAmount(
  baseUnits: bigint,
  decimals: number,
  locale = readerLocale(),
): string {
  const negative = baseUnits < 0n;
  const magnitude = negative ? -baseUnits : baseUnits;
  const divisor = 10n ** BigInt(decimals);
  const whole = magnitude / divisor;
  const fractionDivisor = 10n ** BigInt(Math.max(0, decimals - displayFractionDigits));
  const fraction = (magnitude % divisor) / fractionDivisor;
  const sign = negative ? '-' : '';
  const wholeText = grouping(locale).format(whole);
  const fractionText = fraction.toString().padStart(displayFractionDigits, '0');
  return `${sign}${wholeText}.${fractionText}`;
}
