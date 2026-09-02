import { liquidityNoteForCategory, nameForCategory } from '@depawn/contracts';
import type { ReceiptResponse, RedemptionRequestResponse } from '@depawn/contracts';
import {
  DateTime,
  Dialog,
  Explain,
  ItemPhotograph,
  Money,
  StatusBadge,
  Stepper,
  custodyReadingFor,
  redemptionStepIndex,
  redemptionSteps,
} from '@depawn/ui';
import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { shortReference } from './holding-tile';

export interface HoldingDetailProps {
  readonly receipt: ReceiptResponse;
  readonly redemption: RedemptionRequestResponse | undefined;
  /* The live listing standing against this item, if there is one. */
  readonly listing: { readonly id: string; readonly status: string } | undefined;
  readonly onClose: () => void;
}

/* Everything the vault knows about one item, which is a good deal more than
   a tile has room for. No request of its own: the receipt and the redemption
   are already on the screen behind it, so opening a record costs nothing and
   cannot fail separately from the page. */
export function HoldingDetail({
  receipt,
  redemption,
  listing,
  onClose,
}: HoldingDetailProps): ReactElement {
  const reading = custodyReadingFor(receipt.status, redemption?.status ?? null, listing?.status);
  const liquidity = liquidityNoteForCategory(receipt.itemCategory);

  return (
    <Dialog title={receipt.itemDescription} isOpen width="lg" onClose={onClose}>
      <div data-testid={`holding-detail-${receipt.id}`} className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row">
          <ItemPhotograph
            src={receipt.hasPhotograph ? `/api/v1/receipts/${receipt.id}/photo` : null}
            alt={receipt.itemDescription}
            size="detail"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={reading.tone} label={reading.label} />
              <span className="font-body text-sm text-ink-secondary">{reading.detail}</span>
            </div>
            <p className="font-body text-sm text-ink-secondary">
              {nameForCategory(receipt.itemCategory)}
              {liquidity === null ? '' : `. ${liquidity}`}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3">
              <Figure
                label="Appraised value"
                explain={<Explain termId="appraisedValue" audience="borrower" />}
              >
                <Money value={receipt.appraisedValue} />
              </Figure>
              <Figure label="Appraised">
                <DateTime iso={receipt.appraisedAt} precision="date" />
              </Figure>
            </dl>
          </div>
        </div>

        {redemption === undefined ? null : (
          <section className="flex flex-col gap-2 border-t border-edge pt-4">
            <h3 className="font-heading text-base font-semibold text-ink-primary">
              Getting it back
            </h3>
            <Stepper
              steps={[...redemptionSteps]}
              currentIndex={redemptionStepIndex(redemption.status)}
            />
          </section>
        )}

        {/* The way to the market from the item, which a borrower arriving
            here from "Taking offers" is looking for. */}
        {listing?.status !== 'ACTIVE' ? null : (
          <section className="border-t border-edge pt-4">
            <p className="font-body text-sm text-ink-secondary">
              This item is on the market.{' '}
              <Link
                to="/listings"
                search={{ listing: listing.id }}
                data-testid={`open-listing-${receipt.id}`}
                className="text-status-active underline"
              >
                See the offers standing against it
              </Link>
            </p>
          </section>
        )}

        {receipt.encumberedByLoanId === null ? null : (
          <section className="border-t border-edge pt-4">
            <p className="font-body text-sm text-ink-secondary">
              A loan is standing against this item.{' '}
              <Link
                to="/portfolio"
                search={{ side: 'borrowing' }}
                className="text-status-active underline"
              >
                See what it costs to settle
              </Link>
            </p>
          </section>
        )}

        {/* The custody record: what a person quotes at a counter or in a
            dispute. Each value is shown short and kept whole in the title,
            because a column of full ULIDs and a sha256 is unreadable and the
            exact string still has to be recoverable. */}
        <section className="flex flex-col gap-2 border-t border-edge pt-4">
          <h3 className="font-heading text-base font-semibold text-ink-primary">Custody record</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Record
              label="Receipt reference"
              value={receipt.id}
              short={shortReference(receipt.id)}
            />
            <Record label="Vault" value={receipt.vaultId} />
            <Record label="Insurance policy" value={receipt.insurancePolicyReference} />
            {/* The proof the intake happened and has not been edited since.
                It becomes a chain digest in Phase 3. */}
            <Record
              label="Intake record hash"
              value={receipt.intakeRecordHash}
              short={`${receipt.intakeRecordHash.slice(0, 12)}...`}
            />
            {/* What separates this one from another of the same model, so it
                is shown whole rather than shortened: a borrower checking that
                the watch coming back is the watch they left needs the digits,
                not the first six of them. A watch has two, most art has
                none. */}
            {receipt.serialNumbers.length === 0 ? null : (
              <div className="min-w-0 sm:col-span-2">
                <dt className="font-body text-xs text-ink-secondary">
                  {receipt.serialNumbers.length === 1 ? 'Serial number' : 'Serial numbers'}
                </dt>
                {receipt.serialNumbers.map((serial) => (
                  <dd key={serial} className="mt-0.5 break-all font-mono text-sm text-ink-primary">
                    {serial}
                  </dd>
                ))}
              </div>
            )}
          </dl>
        </section>
      </div>
    </Dialog>
  );
}

function Figure({
  label,
  children,
  explain,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly explain?: ReactElement;
}): ReactElement {
  return (
    <div>
      <dt className="flex items-center font-body text-xs text-ink-secondary">
        {label}
        {explain}
      </dt>
      <dd className="mt-0.5 font-figure text-sm tabular-nums text-ink-primary">{children}</dd>
    </div>
  );
}

/* Shows the short form and keeps the whole value selectable in the title, so
   a reader can quote either without the column becoming unreadable. */
function Record({
  label,
  value,
  short,
}: {
  readonly label: string;
  readonly value: string;
  readonly short?: string;
}): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="font-body text-xs text-ink-secondary">{label}</dt>
      <dd title={value} className="mt-0.5 truncate font-mono text-sm text-ink-primary">
        {short ?? value}
      </dd>
    </div>
  );
}
