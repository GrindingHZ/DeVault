/* One definition of what touching a control feels like, composed by every
   interactive surface in the product rather than restated by each of them.

   Before P8h there were six copies of the focus ring and four opinions about
   what a selected pill looks like, because there was nowhere for the answer
   to live. A tab pressed differently to a button for no reason anybody
   chose. This file is that place, so a change to how the product responds to
   a hand is one edit rather than a search.

   Nothing here names a duration, a distance or a curve. It names tokens, and
   the surface the control landed on decides what they mean: emphatic on the
   marketplace floor, nearly still on a vault terminal, absent entirely for a
   reader who has asked their system for less motion. */

/* WCAG 2.4.7. Offset rather than inset so the ring reads against a filled
   control and a bare one alike, and `status-active` rather than the accent
   because focus is a statement about the keyboard rather than about the
   brand. */
export const focusRing = [
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-status-active',
].join(' ');

/* The same ring drawn inside the control, for one sitting flush against the
   edge of a container that would otherwise clip it. */
export const focusRingInset = [
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2',
  'focus-visible:outline-status-active',
].join(' ');

/* The gesture on its own, with no ring, so the two variants below can each
   pair it with the ring their position calls for. Nothing outside this file
   should need it: a control wants one of the two exports underneath. */
const pressMotion = [
  'cursor-pointer select-none',

  /* The properties are named rather than `all`, so a control whose width
     changes because its label changed does not slide to the new width. */
  'transition-[color,background-color,border-color,box-shadow,transform]',

  /* Fast in, elastic out. The compression is an acknowledgement and wants to
     be immediate; the release is the part a reader actually watches, so it
     takes the longer duration and the curve that overshoots. On every
     surface except the floor `ease-spring` resolves to the ordinary entering
     curve, which is how the console gets the same gesture without the
     bounce. */
  'duration-enter ease-spring',
  'active:duration-control active:ease-enter active:scale-press',

  /* A pixel. Enough that the cursor feels like it picked something up,
     little enough that a row of controls does not ripple as a hand crosses
     it. Transform rather than margin, so nothing around it reflows. */
  'hover:translate-y-lift',

  /* A disabled control still has to look like the control it is, so the
     treatment is removed rather than the element being restyled. Without
     these two a disabled button still hops and compresses, which promises an
     action that is not going to happen. */
  'disabled:cursor-not-allowed disabled:opacity-50',
  'disabled:hover:translate-y-0 disabled:active:scale-100',
].join(' ');

export const pressable = [pressMotion, focusRing].join(' ');

/* For a control flush inside a bordered container: a rail destination, a row
   in a table, a cell in a book. */
export const pressableInset = [pressMotion, focusRingInset].join(' ');
