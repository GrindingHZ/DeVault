import { describe, expect, it } from 'vitest';
import type { ProtocolParameters } from '../marketplace/protocol-parameters';
import {
  accountIdOf,
  borrowerNoteIdOf,
  lenderNoteIdOf,
  loanIdOf,
  noteSaleIdOf,
  receiptIdOf,
} from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import type { LenderNote } from './lender-note';
import { Loan } from './loan';
import { NoteSale } from './note-sale';
import type { NoteSaleStatus } from './note-sale';
import { assertNoteSalePurchasable } from './note-sale-purchase-policy';
import type { PurchaseAttempt } from './note-sale-purchase-policy';

const usd = currencyOf('USD');
const startedAt = Instant.fromEpochMilliseconds(1_700_000_000_000n);
const tenDaysIn = startedAt.plusMilliseconds(10n * 86_400_000n);

const parameters: ProtocolParameters = {
  maxLoanToValueBasisPointsByCategory: {
    BULLION: 6000,
    WATCH: 5000,
    JEWELLERY: 4500,
    COLLECTIBLE: 3500,
    ART: 3000,
  },
  maxAnnualPercentageRateBasisPoints: 4800,
  minimumOfferLifetimeMs: 600_000n,
  originationFeeBasisPoints: 200,
  liquidationFeeBasisPoints: 300,
  gracePeriodMs: 604_800_000n,
  statutoryHoldingPeriodMs: 2_592_000_000n,
  dualAppraisalThreshold: Money.of(10_000_000n, usd),
  notesTransferable: true,
};

function originate(): Loan {
  return Loan.originate({
    id: loanIdOf('LOAN1'),
    receiptId: receiptIdOf('R1'),
    borrowerAccountId: accountIdOf('BORROWER'),
    principal: Money.of(250_000n, usd),
    annualPercentageRateBasisPoints: 2400,
    startedAt,
    durationMs: 30n * 86_400_000n,
    gracePeriodMs: 7n * 86_400_000n,
    liquidationFeeBasisPoints: 300,
    lenderNoteId: lenderNoteIdOf('LN1'),
    borrowerNoteId: borrowerNoteIdOf('BN1'),
    originationSettlementRef: { kind: 'ledger', reference: 'settle-1', settledAt: startedAt },
  });
}

function saleIn(status: NoteSaleStatus): NoteSale {
  return NoteSale.restore({
    id: noteSaleIdOf('SALE1'),
    lenderNoteId: lenderNoteIdOf('LN1'),
    loanId: loanIdOf('LOAN1'),
    sellerAccountId: accountIdOf('SELLER'),
    askPrice: Money.of(240_000n, usd),
    createdAt: tenDaysIn,
    status,
    version: 0,
  });
}

function attempt(overrides: Partial<PurchaseAttempt> = {}): PurchaseAttempt {
  const loan = originate();
  const note: LenderNote = {
    id: loan.lenderNoteId,
    loanId: loan.id,
    holderAccountId: accountIdOf('SELLER'),
    transferable: true,
  };
  return {
    sale: saleIn('OPEN'),
    loan,
    note,
    buyerAccountId: accountIdOf('BUYER'),
    parameters,
    ...overrides,
  };
}

describe('assertNoteSalePurchasable', () => {
  it('lets a funded stranger buy an open sale', () => {
    expect(assertNoteSalePurchasable(attempt()).ok).toBe(true);
  });

  it('refuses a sale that is not open', () => {
    const checked = assertNoteSalePurchasable(attempt({ sale: saleIn('WITHDRAWN') }));
    expect(!checked.ok && checked.error.code).toBe('NOTE_SALE_NOT_OPEN');
  });

  it('refuses while the transfer parameter is off', () => {
    const checked = assertNoteSalePurchasable(
      attempt({ parameters: { ...parameters, notesTransferable: false } }),
    );
    expect(!checked.ok && checked.error.code).toBe('NOTE_TRANSFER_DISABLED');
  });

  it('refuses a note minted non transferable', () => {
    const base = attempt();
    const checked = assertNoteSalePurchasable({
      ...base,
      note: { ...base.note, transferable: false },
    });
    expect(!checked.ok && checked.error.code).toBe('NOTE_TRANSFER_DISABLED');
  });

  it('refuses once the loan has closed', () => {
    const loan = originate();
    const repaid = loan.recordRepayment(loan.calculateAmountDue(tenDaysIn), tenDaysIn);
    if (!repaid.ok) {
      throw repaid.error;
    }
    const checked = assertNoteSalePurchasable(attempt({ loan: repaid.value.loan }));
    expect(!checked.ok && checked.error.code).toBe('LOAN_NOT_ACTIVE');
  });

  it('refuses when the note holder is no longer the seller', () => {
    const base = attempt();
    const checked = assertNoteSalePurchasable({
      ...base,
      note: { ...base.note, holderAccountId: accountIdOf('SOMEBODY-ELSE') },
    });
    expect(!checked.ok && checked.error.code).toBe('NOTE_SALE_NOT_OPEN');
  });

  it('refuses the seller buying their own sale', () => {
    const checked = assertNoteSalePurchasable(attempt({ buyerAccountId: accountIdOf('SELLER') }));
    expect(!checked.ok && checked.error.code).toBe('CANNOT_BUY_OWN_POSITION');
  });

  it('refuses the borrower buying their own debt', () => {
    const checked = assertNoteSalePurchasable(attempt({ buyerAccountId: accountIdOf('BORROWER') }));
    expect(!checked.ok && checked.error.code).toBe('CANNOT_BUY_OWN_POSITION');
  });
});
