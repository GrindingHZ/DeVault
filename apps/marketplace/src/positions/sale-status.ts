import type { NoteSaleStatusDto } from '@depawn/contracts';
import type { StatusTone } from '@depawn/ui';

/* What a seller's own sale is doing, in words rather than in the shape the
   database stores it. OPEN and VOIDED are correct names for a state machine
   and the wrong thing to show a person (docs/09-conventions.md). */
const meanings: Record<NoteSaleStatusDto, { readonly label: string; readonly tone: StatusTone }> = {
  OPEN: { label: 'Listed', tone: 'active' },
  SOLD: { label: 'Sold', tone: 'success' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  /* The loan closed underneath it, which took the sale with it. Neutral
     rather than a warning: nothing was lost and nothing needs doing. */
  VOIDED: { label: 'Ended', tone: 'neutral' },
};

export function saleStatusOf(status: NoteSaleStatusDto): {
  readonly label: string;
  readonly tone: StatusTone;
} {
  return meanings[status];
}
