import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMutationFeedback } from './use-mutation-feedback';

describe('useMutationFeedback', () => {
  it('starts with nothing to say', () => {
    const { result } = renderHook(() => useMutationFeedback());
    expect(result.current.messages).toEqual([]);
  });

  it('reports a success and a failure in their own tones', () => {
    const { result } = renderHook(() => useMutationFeedback());
    act(() => {
      result.current.reportSuccess('The offer was placed.');
      result.current.reportFailure('The offer was refused.');
    });
    expect(result.current.messages.map((message) => message.tone)).toEqual(['success', 'danger']);
    expect(result.current.messages[0]?.text).toBe('The offer was placed.');
  });

  /* Two identical outcomes are two events. Collapsing them would tell a
     person one of their two actions did nothing. */
  it('keeps two identical messages apart', () => {
    const { result } = renderHook(() => useMutationFeedback());
    act(() => {
      result.current.reportSuccess('Saved.');
      result.current.reportSuccess('Saved.');
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.id).not.toBe(result.current.messages[1]?.id);
  });

  it('dismisses one and leaves the others', () => {
    const { result } = renderHook(() => useMutationFeedback());
    act(() => {
      result.current.reportSuccess('First.');
      result.current.reportSuccess('Second.');
    });
    const first = result.current.messages[0]?.id ?? '';
    act(() => {
      result.current.dismiss(first);
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.text).toBe('Second.');
  });

  /* A success is read once and then is in the way; a failure has to stay
     until the person has read what went wrong. */
  it('lets a success leave on its own and keeps a failure', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMutationFeedback());
    act(() => {
      result.current.reportSuccess('Done.');
      result.current.reportFailure('Refused.');
    });
    expect(result.current.messages).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(result.current.messages.map((message) => message.tone)).toEqual(['danger']);
    vi.useRealTimers();
  });
});
