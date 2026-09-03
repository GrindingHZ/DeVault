/// <reference path="./assets.d.ts" />
import type { ReactElement } from 'react';
import usdcMark from './usdc.svg';

/* The coin the book settles in, drawn as Circle's mark rather than spelled as
   a code. Any other currency is still spelled out: the mark stands for one
   coin, and a reader being told which dollar they are looking at is the case
   the code was kept for.

   An image asset rather than an inline path, because the colours are Circle's
   and not ours. That is the exemption docs/DESIGN-BRIEF.md gives the favicon:
   an asset has no token to reach for. It sizes to the text beside it, so a
   balance in a header and a figure in a table each get a coin the height of
   their own digits. */
export function CurrencyMark({ currency }: { readonly currency: string }): ReactElement {
  if (currency !== 'USDC') {
    return <>{currency}</>;
  }
  return (
    <img
      src={usdcMark}
      alt="USDC"
      title="USDC"
      className="inline-block h-[1em] w-[1em] shrink-0 select-none align-[-0.15em]"
    />
  );
}
