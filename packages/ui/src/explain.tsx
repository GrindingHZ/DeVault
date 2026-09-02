import type { ReactElement } from 'react';
import { explain, mattersFor } from './glossary';
import type { GlossaryAudience } from './glossary';
import { Popover } from './popover';

export interface ExplainProps {
  /* A key into the glossary, not the words on screen, so two places
     explaining the same thing cannot drift apart. */
  readonly termId: string;
  readonly audience?: GlossaryAudience;
}

/* An affordance next to a term the reader may not know. Opens on click
   rather than hover: hover has no touch equivalent and no keyboard
   equivalent, so a hover tooltip is a feature only some people get.

   This is never the only place a rule appears. Anything that can refuse
   somebody's money belongs in the visible copy as well; the popover is for
   depth, not for hiding consequences.

   The panel used to be positioned beside the trigger, which meant the
   workspace clipped it. Both panes there scroll, and an element positioned
   inside a scrolling box cannot leave it however high its stacking order is,
   so an explanation opened next to the appraised value lost its left half to
   the edge of the pane. It shares the product's one Popover now, which
   leaves the document and is placed against the trigger by hand. */
export function Explain({ termId, audience = 'any' }: ExplainProps): ReactElement | null {
  const entry = explain(termId);
  if (entry === null) {
    return null;
  }
  const matters = mattersFor(entry, audience);

  return (
    <Popover
      label={`What ${entry.term.toLowerCase()} means`}
      testId={`explain-${termId}`}
      width={288}
      /* A definition is read, not commanded. Dragging across a word to
         reread it would otherwise dismiss the thing being read. */
      closesOnAction={false}
      trigger="i"
      triggerClassName={[
        'ml-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center',
        'rounded-full border border-edge font-body text-[10px] font-semibold italic leading-none',
        'text-ink-secondary transition-colors duration-control ease-enter',
        'hover:border-accent hover:text-accent',
        'aria-expanded:border-accent aria-expanded:bg-surface-sunken aria-expanded:text-accent',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
      ].join(' ')}
    >
      <div data-testid={`explanation-${termId}`} className="p-4">
        <span className="block font-body text-sm font-semibold text-ink-primary">{entry.term}</span>
        <span className="mt-1 block font-body text-sm leading-relaxed text-ink-secondary">
          {entry.definition}
        </span>
        {matters === null ? null : (
          <span className="mt-3 block border-t border-edge pt-3 font-body text-sm leading-relaxed text-ink-primary">
            <span className="font-semibold text-accent">Why it matters to you: </span>
            {matters}
          </span>
        )}
      </div>
    </Popover>
  );
}
