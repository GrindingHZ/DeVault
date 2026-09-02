import type { ReactElement } from 'react';

/* Dates follow the same rule as money: the wire carries one format, the
   reader sees another, and the two never meet. An ISO string is a correct
   thing to send and a poor thing to show, and `2026-10-14T08:20:03` was on
   four screens before this existed. */

export type DateTimePrecision = 'date' | 'minute' | 'second';

const optionsByPrecision: Record<DateTimePrecision, Intl.DateTimeFormatOptions> = {
  date: { year: 'numeric', month: 'short', day: 'numeric' },
  minute: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  second: {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  },
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(locale: string, precision: DateTimePrecision): Intl.DateTimeFormat {
  const key = `${locale}:${precision}`;
  const cached = formatterCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat(locale, optionsByPrecision[precision]);
  formatterCache.set(key, formatter);
  return formatter;
}

function readerLocale(): string {
  return typeof navigator === 'undefined' ? 'en-AU' : navigator.language;
}

/* An empty string rather than "Invalid Date". A screen that cannot read one
   timestamp should show one gap, not one lie. */
export function formatInstant(
  iso: string,
  precision: DateTimePrecision = 'minute',
  locale = readerLocale(),
): string {
  const epochMs = Date.parse(iso);
  if (!Number.isFinite(epochMs)) {
    return '';
  }
  return formatterFor(locale, precision).format(new Date(epochMs));
}

export interface DateTimeProps {
  readonly iso: string;
  readonly precision?: DateTimePrecision;
  /* Override the reader's own locale. For tests, and for a screen that
     deliberately shows a moment the way another market would. */
  readonly locale?: string;
}

export function DateTime({
  iso,
  precision = 'minute',
  locale,
}: DateTimeProps): ReactElement | null {
  const formatted = formatInstant(iso, precision, locale);
  if (formatted === '') {
    return null;
  }
  /* The machine readable value survives in the attribute, so anything that
     wants the instant rather than the rendering can still have it. */
  return (
    <time dateTime={iso} className="font-mono tabular-nums">
      {formatted}
    </time>
  );
}
