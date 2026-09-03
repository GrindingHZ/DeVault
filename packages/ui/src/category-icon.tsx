import type { ReactElement } from 'react';

/* A small glyph per collateral category, drawn in the same stroked style as the
   rest of the icon set so a reader can tell a watch from a gold bar at the size
   of a line of text. The name always sits beside it: the icon is recognition,
   not the label. An unknown category falls back to the collectible star rather
   than a hole. */
const glyphs: Record<string, ReactElement> = {
  // A stacked ingot.
  BULLION: (
    <>
      <path d="M4 16h16l-2-5H6z" />
      <path d="M6 11l1.5-2h9L18 11" />
    </>
  ),
  // A watch face with hands and lugs.
  WATCH: (
    <>
      <circle cx="12" cy="13.5" r="5" />
      <path d="M12 13.5V10.5M12 13.5l2.2 1.3" />
      <path d="M9.6 8.7 9 5h6l-.6 3.7" />
    </>
  ),
  // A faceted gem.
  JEWELLERY: (
    <>
      <path d="M12 4l6 5-6 11-6-11z" />
      <path d="M6 9h12M9.5 9L12 20M14.5 9L12 20" />
    </>
  ),
  // A five-point star.
  COLLECTIBLE: (
    <path d="M12 4l2.3 4.7 5.2.8-3.75 3.65.9 5.15L12 15.9l-4.65 2.45.9-5.15L4.5 9.5l5.2-.8z" />
  ),
  // A framed landscape.
  ART: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M4 15l4.5-4 3 2.5L15 9l5 5" />
    </>
  ),
};

export function CategoryIcon({
  category,
  className,
}: {
  readonly category: string;
  readonly className?: string;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? 'h-4 w-4 shrink-0'}
    >
      {glyphs[category] ?? glyphs.COLLECTIBLE}
    </svg>
  );
}
