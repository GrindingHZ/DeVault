import type { StatusTone } from './status-badge';

export interface CustodyReading {
  readonly tone: StatusTone;
  /* What state the item is in, in the reader's words. */
  readonly label: string;
  /* Where the thing physically is, which the label alone does not settle. */
  readonly detail: string;
}

/* A receipt and a redemption request are two state machines, and the borrower
   inventory used to give each of them its own column. That reads wrong in
   both directions.

   Requesting a redemption burns the receipt in the same transaction
   (docs/10-flows.md flow 6), so the receipt turns `RELEASED` the instant a
   borrower asks for their item back. `RELEASED` means the token is spent,
   which is the correct word for the state machine, and the screen rendered it
   as "Collected" while the watch was still on a shelf in New York. It said so
   for the whole verification window, which is exactly when a borrower is
   anxious and checking. On a finished redemption it then said "Collected"
   and "Handed over" side by side: one event, stated twice.

   Read together the two answer one question, so they are read together here
   and rendered once.

   Statuses arrive as strings rather than as the wire types, because this
   package deliberately does not depend on the contracts package. */
export function custodyReadingFor(
  receiptStatus: string,
  redemptionStatus: string | null,
  listingStatus: string | null = null,
): CustodyReading {
  if (receiptStatus === 'IN_VAULT') {
    /* Listing does not move the item and does not touch the receipt, so a
       listed item and an idle one were the same word on the shelf: "In the
       vault", above a button offering to list something already listed. The
       listing is the more particular truth about it, so it wins the label. */
    if (listingStatus === 'ACTIVE') {
      return {
        tone: 'active',
        label: 'Taking offers',
        detail: 'Listed on the market. Lenders are competing to fund it.',
      };
    }
    if (listingStatus === 'DRAFT') {
      return {
        tone: 'neutral',
        label: 'Draft listing',
        detail: 'Written but not published. No lender can see it yet.',
      };
    }
    return { tone: 'active', label: 'In the vault', detail: 'Yours to list or to ask back.' };
  }
  if (receiptStatus === 'ENCUMBERED') {
    return {
      tone: 'warning',
      label: 'Securing a loan',
      detail: 'It stays here until the loan is settled.',
    };
  }
  if (receiptStatus === 'LIQUIDATED') {
    return { tone: 'danger', label: 'Sold', detail: 'Sold after the loan defaulted.' };
  }

  /* RELEASED, and only the redemption says whether the item has actually
     left the building. */
  if (redemptionStatus === 'REQUESTED') {
    return {
      tone: 'active',
      label: 'Collection requested',
      detail: 'Still in the vault. Bring photo identification to the counter.',
    };
  }
  if (redemptionStatus === 'VERIFIED') {
    return {
      tone: 'active',
      label: 'Identity verified',
      detail: 'Still in the vault. The counter is expecting you.',
    };
  }
  if (redemptionStatus === 'RELEASED') {
    return { tone: 'neutral', label: 'Handed over', detail: 'You have it.' };
  }
  return { tone: 'neutral', label: 'Collected', detail: 'The receipt is spent.' };
}

/* The steps a redemption walks, shown as progress on the item record. */
export const redemptionSteps = ['Requested', 'Identity verified', 'Handed over'] as const;

export function redemptionStepIndex(redemptionStatus: string): number {
  if (redemptionStatus === 'RELEASED') {
    return 2;
  }
  return redemptionStatus === 'VERIFIED' ? 1 : 0;
}
