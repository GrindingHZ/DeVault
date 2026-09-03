import { ChainLink, LockIcon, PersonIcon, ReceiptIcon } from '@depawn/ui';
import type { ReactElement, ReactNode } from 'react';

export interface ListingChainRecordProps {
  readonly pledgeObjectId: string;
  /* Null when the chain does not know the item, which is said rather than
     left as a missing row. */
  readonly receiptObjectId: string | null;
  readonly borrowerAddress: string;
}

/* What the chain holds for this listing, each record opening on the explorer.

   One link labelled "on chain" left a reader to work out what the object at
   the end of it was. A listing is three things on chain: the pledge, a shared
   escrow that wraps the collateral and takes the offers; the vault receipt
   inside it, which is the item; and the borrower, an address rather than a
   name. Each is named before it is linked, because a hash says nothing about
   which of the three it is. The offers have their own column in the book. */
export function ListingChainRecord({
  pledgeObjectId,
  receiptObjectId,
  borrowerAddress,
}: ListingChainRecordProps): ReactElement {
  return (
    <section
      aria-label="On chain"
      data-testid="listing-chain-record"
      className="flex flex-col gap-2"
    >
      <h3 className="font-body text-xs font-medium uppercase tracking-wide text-ink-secondary">
        On chain
      </h3>
      <ul className="flex flex-col gap-2">
        <Record icon={<LockIcon />} label="Pledge">
          <ChainLink value={pledgeObjectId} kind="object" testId="listing-chain-object" />
        </Record>
        <Record icon={<ReceiptIcon />} label="Vault receipt">
          {receiptObjectId === null ? (
            <span className="font-body text-xs text-ink-secondary">Not on chain</span>
          ) : (
            <ChainLink value={receiptObjectId} kind="object" testId="listing-chain-receipt" />
          )}
        </Record>
        <Record icon={<PersonIcon />} label="Borrower">
          <ChainLink value={borrowerAddress} kind="address" testId="listing-chain-borrower" />
        </Record>
      </ul>
    </section>
  );
}

function Record({
  icon,
  label,
  children,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <li className="flex items-center gap-2">
      {/* Decorative: the label beside it says the same thing in words. */}
      <span aria-hidden="true" className="shrink-0 text-ink-secondary">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-body text-xs text-ink-secondary">{label}</span>
        {children}
      </span>
    </li>
  );
}
