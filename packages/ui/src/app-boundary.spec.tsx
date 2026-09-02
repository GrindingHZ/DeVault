import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppBoundary, RouteNotFound, isUnauthenticated } from './app-boundary';

function Exploding(): never {
  throw new Error('deliberate');
}

describe('AppBoundary', () => {
  /* React writes the caught error to the console itself, which is noise
     rather than a failure, so it is silenced for these two cases only. */
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => {
    consoleError.mockRestore();
  });

  it('renders its children when nothing is wrong', () => {
    render(
      <AppBoundary>
        <p>the screen</p>
      </AppBoundary>,
    );
    expect(screen.getByText('the screen')).toBeTruthy();
  });

  /* Before this, one bad render showed a white page and said nothing. */
  it('states the failure instead of showing nothing', () => {
    render(
      <AppBoundary>
        <Exploding />
      </AppBoundary>,
    );
    expect(screen.getByText('This screen did not load')).toBeTruthy();
  });

  it('offers a way out', () => {
    const onRecover = vi.fn();
    render(
      <AppBoundary onRecover={onRecover}>
        <Exploding />
      </AppBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRecover).toHaveBeenCalled();
  });
});

describe('RouteNotFound', () => {
  it('answers a bad address rather than leaving it blank', () => {
    render(<RouteNotFound />);
    expect(screen.getByText('There is nothing at this address')).toBeTruthy();
  });
});

describe('isUnauthenticated', () => {
  it('is true for an expired session', () => {
    expect(isUnauthenticated({ statusCode: 401, code: 'UNAUTHENTICATED' })).toBe(true);
  });

  /* A forbidden action is not an expired session. Signing somebody out for
     asking to do something they may not do would lose their work. */
  it('is false for forbidden, for a fault, and for anything else', () => {
    expect(isUnauthenticated({ statusCode: 403, code: 'FORBIDDEN' })).toBe(false);
    expect(isUnauthenticated({ statusCode: 500, code: 'INTERNAL' })).toBe(false);
    expect(isUnauthenticated(new Error('offline'))).toBe(false);
    expect(isUnauthenticated(null)).toBe(false);
    expect(isUnauthenticated(undefined)).toBe(false);
  });
});
