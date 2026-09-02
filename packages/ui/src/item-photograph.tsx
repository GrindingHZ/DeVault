import { useState } from 'react';
import type { ReactElement } from 'react';

export interface ItemPhotographProps {
  readonly src: string | null;
  readonly alt: string;
  readonly size?: 'thumbnail' | 'row' | 'detail';
  readonly testId?: string;
}

const boxBySize = {
  thumbnail: 'h-14 w-14 rounded-md',
  /* The browse rail. A lender is deciding whether to lend against this
     specific object, so the photograph is the largest thing in the row. */
  row: 'h-16 w-16 rounded-md',
  detail: 'h-40 w-40 rounded-lg',
} as const;

/* The item, or a placeholder that holds its space. The space is reserved
   either way: a row that grows a photograph after the fact shifts everything
   under it, and a marketplace that jumps while you are reading it does not
   feel like somewhere to leave money.

   A photograph that fails to load falls back to the placeholder rather than a
   broken image icon, because the media endpoint answers not found for an item
   the viewer is not entitled to see, and that is a normal answer. */
export function ItemPhotograph({
  src,
  alt,
  size = 'thumbnail',
  testId,
}: ItemPhotographProps): ReactElement {
  const [hasFailed, setHasFailed] = useState(false);
  const box = boxBySize[size];

  if (src === null || hasFailed) {
    /* Says there is no photograph rather than leaving a hole. On the dark
       scope the sunken surface is within a shade of the page ground, so a
       plain box read as a gap in the layout instead of as a placeholder. */
    return (
      <div
        data-testid={testId}
        role="img"
        aria-label={`No photograph of ${alt}`}
        title={`No photograph of ${alt}`}
        className={`${box} flex shrink-0 items-center justify-center border border-edge-strong bg-surface-raised text-ink-secondary`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-1/2 w-1/2"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M21 16l-5-5-4.5 4.5" />
        </svg>
      </div>
    );
  }

  return (
    <img
      data-testid={testId}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setHasFailed(true)}
      className={`${box} shrink-0 border border-edge bg-surface-sunken object-cover`}
    />
  );
}
