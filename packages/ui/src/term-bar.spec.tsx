import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TermBar } from './term-bar';

describe('TermBar', () => {
  /* Colour carries nothing on its own. A reader who cannot see the fill has
     to get the same answer from the note. */
  it('says in words what the bar says in length', () => {
    render(<TermBar elapsedBasisPoints={3667} note="38 days to maturity" tone="active" />);
    expect(screen.getByText('38 days to maturity')).toBeTruthy();
  });

  it('reports its value to assistive technology', () => {
    render(<TermBar elapsedBasisPoints={3667} note="38 days to maturity" tone="active" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('37');
    expect(bar.getAttribute('aria-valuetext')).toBe('38 days to maturity');
  });

  /* A term past maturity is clamped by the caller, but a bar that trusted
     its input would still paint outside its track. */
  it('never paints past full', () => {
    const { container } = render(
      <TermBar elapsedBasisPoints={99_999} note="grace has run out" tone="danger" />,
    );
    expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toContain('100%');
  });

  /* Two questions, two lines. "day 21 of 30" says where the term has got to
     and "9 days left" says what that leaves, and a reader should not have to
     subtract one from the other. */
  it('carries both readings when there is a second one', () => {
    render(
      <TermBar
        elapsedBasisPoints={7000}
        note="day 21 of 30"
        caption={{ value: '9 days', trail: 'left' }}
        tone="active"
      />,
    );
    expect(screen.getByText('day 21 of 30')).toBeTruthy();
    /* The quantity carries the weight and the grammar around it does not, so
       the two are separate elements rather than one string. */
    expect(screen.getByText('9 days')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe(
      'day 21 of 30, 9 days left',
    );
  });

  /* Spoken as one sentence even though it is printed as two pieces: an
     assistive reader gets the whole phrase, not a bare number. */
  it('speaks a caption with no trailing words cleanly', () => {
    render(
      <TermBar
        elapsedBasisPoints={0}
        note="closes in"
        caption={{ value: '7 days', trail: '' }}
        tone="active"
      />,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe(
      'closes in, 7 days',
    );
  });

  /* Nothing is left to count once grace has run out, so nothing is offered
     as a second line rather than an empty one being reserved. */
  it('renders one line when there is nothing more to say', () => {
    render(<TermBar elapsedBasisPoints={10_000} note="grace has run out" tone="danger" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe(
      'grace has run out',
    );
  });

  it('never paints a negative width', () => {
    const { container } = render(
      <TermBar elapsedBasisPoints={-500} note="not started" tone="neutral" />,
    );
    expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toContain('0%');
  });
});
