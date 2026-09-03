import type { ReactElement } from 'react';

/* The mark, drawn rather than shipped as a raster.

   Three ideas stacked, which is the whole brand argument in one glyph: a
   hexagon broken into segments is the distributed ledger the loan book moves
   onto in Phase 3; the shield inside it is custody, because somebody is
   physically holding your property; and the counter knocked out of the shield
   is the D of the name.

   Every colour is `currentColor`, so the mark takes the accent of whatever
   scope it lands in: the green on the marketplace floor, the darker green on
   the light consoles. Depth comes from opacity rather than from a second
   colour, which keeps one source of truth for the brand green and keeps the
   token check satisfied.

   The geometry is a pointy top hexagon of circumradius 13.5 on a 32 grid, so
   its side is also 13.5 and the dash pattern below divides the perimeter into
   exactly six segments with a gap centred on every vertex. Change the radius
   and the dashes have to be recomputed. */

const hexagonPoints = '16,2.5 27.69,9.25 27.69,22.75 16,29.5 4.31,22.75 4.31,9.25';

/* One dash and one gap per side: 10 + 3.5 = 13.5. Half the gap of offset
   walks the pattern back so the break straddles each corner instead of
   starting after it. */
const segmentDashes = '10 3.5';
const segmentOffset = 1.75;

/* The shield, then the D, in one path. Even odd turns the second subpath into
   a hole, so the letter is the surface behind showing through and never has
   to know what colour that surface is.

   The shield is deliberately close to the ring and the counter is deliberately
   fat. A thinner version of both was prettier at 96 pixels and turned to mush
   at 20, which is the size it actually renders at in a header. */
const shieldWithCounter = [
  'M 8.7 9.8 H 23.3 V 16.8',
  'C 23.3 21.4 20.4 24.6 16 26.4',
  'C 11.6 24.6 8.7 21.4 8.7 16.8 Z',
  'M 12.1 13 H 16.3',
  'C 19.1 13 21 14.9 21 17.5',
  'C 21 20.1 19.1 22 16.3 22',
  'H 12.1 Z',
].join(' ');

export interface VaultMarkProps {
  /* Edge length in pixels. The glyph is square and scales cleanly from a
     favicon to a splash. */
  readonly size?: number;
  /* Decorative beside a wordmark, which is the usual case: the name is
     already there in text and a second reading of it is noise. Give a title
     only where the mark stands alone. */
  readonly title?: string;
}

/* Sized for 20 pixels and up. Below that the six segments and their six gaps
   stop being segments and become a smudge, which is why the favicon is its
   own file holding the shield alone rather than a shrunk copy of this. */
export function VaultMark({ size = 28, title }: VaultMarkProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title === undefined ? 'presentation' : 'img'}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
      className="shrink-0"
    >
      <polygon
        points={hexagonPoints}
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="butt"
        strokeDasharray={segmentDashes}
        strokeDashoffset={segmentOffset}
        /* The ring sits back so the shield reads first. */
        opacity={0.7}
      />
      <path d={shieldWithCounter} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export interface BrandLockupProps {
  /* The product this instance is. The mark is shared; the word after it is
     not, because a vault operator and a borrower are not in the same tool. */
  readonly productName: string;
  readonly size?: number;
}

/* Mark plus name. The name stays live text rather than being drawn into the
   SVG, so it stays selectable, searchable and translatable, and so it inherits
   the type scale instead of fighting it. */
export function BrandLockup({ productName, size = 24 }: BrandLockupProps): ReactElement {
  return (
    <span className="flex min-w-0 items-center gap-2 text-accent">
      <VaultMark size={size} />
      {/* On a phone the header has room for the mark, the balance and the
          account, not a name as well: a name truncated to its first letter
          said less than the mark alone. It stays in the accessible name. */}
      <span className="truncate font-heading text-base font-semibold text-ink-primary max-sm:sr-only">
        {productName}
      </span>
    </span>
  );
}
