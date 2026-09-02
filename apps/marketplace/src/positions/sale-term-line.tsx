import type { NoteSaleSummary } from '@depawn/contracts';
import type { ReactElement } from 'react';
import { termPartsOf } from './sale-figures';

/* What kind of thing, at what rate, until when.

   The date is the only part in bold: the category and the rate are read once
   and the maturity is what a reader compares down the column, so weight goes
   to the figure that is actually being scanned rather than to the sentence
   around it. */
export function SaleTermLine({ sale }: { readonly sale: NoteSaleSummary }): ReactElement {
  const parts = termPartsOf(sale);
  return (
    <span className="font-body text-xs text-ink-secondary">
      {parts.category}
      <Separator />
      {parts.rate}
      <Separator />
      matures{' '}
      <strong data-testid="matures-on" className="font-semibold text-ink-primary">
        {parts.maturesOn}
      </strong>
    </span>
  );
}

function Separator(): ReactElement {
  return (
    <span aria-hidden="true" className="mx-1.5 text-edge-strong">
      |
    </span>
  );
}
