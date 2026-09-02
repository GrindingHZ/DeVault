import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DateTime, formatInstant } from './date-time';

const iso = '2026-10-14T08:20:03.000Z';

describe('formatInstant', () => {
  it('never shows the wire format', () => {
    const formatted = formatInstant(iso, 'second', 'en-AU');
    expect(formatted).not.toContain('T');
    expect(formatted).not.toContain(iso);
  });

  it('says more the finer the precision', () => {
    const date = formatInstant(iso, 'date', 'en-AU');
    const minute = formatInstant(iso, 'minute', 'en-AU');
    const second = formatInstant(iso, 'second', 'en-AU');
    expect(minute.length).toBeGreaterThan(date.length);
    expect(second.length).toBeGreaterThan(minute.length);
  });

  it('follows the locale it is given', () => {
    expect(formatInstant(iso, 'date', 'en-US')).not.toBe(formatInstant(iso, 'date', 'de-DE'));
  });

  /* One unreadable timestamp should leave one gap, not print a lie across a
     column of otherwise correct rows. */
  it('returns nothing for a value it cannot read', () => {
    expect(formatInstant('not a date')).toBe('');
    expect(formatInstant('')).toBe('');
  });
});

describe('DateTime', () => {
  it('keeps the machine readable value in the attribute', () => {
    const { container } = render(<DateTime iso={iso} locale="en-AU" />);
    expect(container.querySelector('time')?.getAttribute('dateTime')).toBe(iso);
  });

  it('shows the reader a formatted moment', () => {
    render(<DateTime iso={iso} precision="date" locale="en-AU" />);
    expect(screen.getByText(formatInstant(iso, 'date', 'en-AU'))).toBeTruthy();
  });

  it('renders nothing at all for an unreadable value', () => {
    const { container } = render(<DateTime iso="not a date" />);
    expect(container.firstChild).toBeNull();
  });
});
