import { useCallback, useRef, useState } from 'react';
import type { ToastMessage } from './toast';

/* Every mutation in three applications reported failure as inline red text
   and reported success by saying nothing at all, which leaves a person
   wondering whether the button worked. This is the other half.

   Inline text keeps its job: an error that belongs beside a field belongs
   beside that field. This carries the outcome of an action whose result is
   not otherwise visible on the screen. */
export interface MutationFeedback {
  readonly messages: readonly ToastMessage[];
  readonly reportSuccess: (text: string) => void;
  readonly reportFailure: (text: string) => void;
  readonly dismiss: (id: string) => void;
}

export function useMutationFeedback(): MutationFeedback {
  const [messages, setMessages] = useState<readonly ToastMessage[]>([]);

  /* A counter rather than a timestamp or a random value: two identical
     reports in the same millisecond must still be two messages.

     A ref rather than state, because bumping it is not something the screen
     re-renders for, and updating one piece of state from inside another
     one's updater is a side effect in a place React is allowed to run twice. */
  const nextId = useRef(0);

  const report = useCallback((tone: ToastMessage['tone'], text: string) => {
    const id = `feedback-${String(nextId.current)}`;
    nextId.current += 1;
    setMessages((current) => [...current, { id, tone, text }]);
  }, []);

  const reportSuccess = useCallback((text: string) => report('success', text), [report]);
  const reportFailure = useCallback((text: string) => report('danger', text), [report]);

  const dismiss = useCallback((id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  return { messages, reportSuccess, reportFailure, dismiss };
}
