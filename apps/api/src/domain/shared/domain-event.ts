import type {
  AccountId,
  LiquidationId,
  ListingId,
  LoanId,
  NoteSaleId,
  OfferId,
  ReceiptId,
  StaffId,
  VaultId,
} from './identifiers';
import type { Instant } from './instant';
import type { Money } from './money';
import type { Distribution, SettlementRef } from './settlement-ref';

/* Every event name matches the Move struct emitted in Phase 3, character for
   character, so the indexer maps chain events onto the same handlers. */
export type DomainEvent =
  | {
      readonly type: 'ReceiptIssued';
      readonly receiptId: ReceiptId;
      readonly vaultId: VaultId;
      readonly appraisedValue: Money;
    }
  | {
      readonly type: 'ListingPublished';
      readonly listingId: ListingId;
      readonly borrowerAccountId: AccountId;
    }
  | {
      readonly type: 'ListingCancelled';
      readonly listingId: ListingId;
      readonly borrowerAccountId: AccountId;
    }
  | {
      readonly type: 'OfferPlaced';
      readonly listingId: ListingId;
      readonly offerId: OfferId;
      readonly principal: Money;
      readonly rateBasisPoints: number;
    }
  | { readonly type: 'OfferWithdrawn'; readonly offerId: OfferId }
  /* Beaten, or on a listing its borrower called off. The hold behind it is
     deliberately not touched: refunds are pull and not push (rule M8), so the
     money keeps sitting there until its owner asks. An indexer rebuilding
     state from events has to know the offer lost without concluding the money
     came back. */
  | {
      readonly type: 'OfferSuperseded';
      readonly offerId: OfferId;
      readonly listingId: ListingId;
    }
  | {
      readonly type: 'LoanOriginated';
      readonly loanId: LoanId;
      readonly listingId: ListingId;
      readonly offerId: OfferId;
      readonly settlementRef: SettlementRef;
    }
  | {
      readonly type: 'LoanRepaid';
      readonly loanId: LoanId;
      readonly amountPaid: Money;
      readonly settlementRef: SettlementRef;
    }
  | { readonly type: 'LoanDefaulted'; readonly loanId: LoanId; readonly defaultedAt: Instant }
  | {
      readonly type: 'ReceiptClaimedByLender';
      readonly loanId: LoanId;
      readonly receiptId: ReceiptId;
      readonly claimantAccountId: AccountId;
    }
  | {
      readonly type: 'RedemptionRequested';
      readonly receiptId: ReceiptId;
      readonly requestedBy: AccountId;
    }
  | { readonly type: 'ItemReleased'; readonly receiptId: ReceiptId; readonly releasedBy: StaffId }
  | {
      readonly type: 'LiquidationScheduled';
      readonly liquidationId: LiquidationId;
      readonly loanId: LoanId;
      readonly reservePrice: Money;
    }
  | {
      readonly type: 'LiquidationOpened';
      readonly liquidationId: LiquidationId;
      readonly closesAt: Instant;
    }
  | { readonly type: 'LiquidationCancelled'; readonly liquidationId: LiquidationId }
  | {
      readonly type: 'LiquidationSettled';
      readonly liquidationId: LiquidationId;
      readonly proceeds: Money;
      readonly distributions: readonly Distribution[];
    }
  | {
      readonly type: 'NoteListedForSale';
      readonly noteSaleId: NoteSaleId;
      readonly loanId: LoanId;
      readonly askPrice: Money;
    }
  | { readonly type: 'NoteSaleWithdrawn'; readonly noteSaleId: NoteSaleId }
  | {
      readonly type: 'NoteSold';
      readonly noteSaleId: NoteSaleId;
      readonly loanId: LoanId;
      readonly fromAccountId: AccountId;
      readonly toAccountId: AccountId;
      readonly price: Money;
      readonly settlementRef: SettlementRef;
    }
  | { readonly type: 'NoteSaleVoided'; readonly noteSaleId: NoteSaleId; readonly loanId: LoanId };
