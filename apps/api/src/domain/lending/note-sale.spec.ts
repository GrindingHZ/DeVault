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
import { NoteSale, allowedNoteSaleTransitions } from './note-sale';
import type { ListNoteForSaleInput, NoteSaleStatus } from './note-sale';

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

function noteFor(loan: Loan, overrides: Partial<LenderNote> = {}): LenderNote {
  return {
    id: loan.lenderNoteId,
    loanId: loan.id,
    holderAccountId: accountIdOf('SELLER'),
    transferable: true,
    ...overrides,
  };
}

function listInput(overrides: Partial<ListNoteForSaleInput> = {}): ListNoteForSaleInput {
  const loan = originate();
  return {
    id: noteSaleIdOf('SALE1'),
    note: noteFor(loan),
    loan,
    sellerAccountId: accountIdOf('SELLER'),
    askPrice: Money.of(240_000n, usd),
    parameters,
    now: tenDaysIn,
    ...overrides,
  };
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

describe('NoteSale.list', () => {
  it('opens a sale at an ask equal to the current value', () => {
    const loan = originate();
    const cap = loan.calculateAmountDue(tenDaysIn);
    const listed = NoteSale.list(listInput({ askPrice: cap }));

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.status).toBe('OPEN');
      expect(listed.value.askPrice.equals(cap)).toBe(true);
      expect(listed.value.lenderNoteId).toBe(loan.lenderNoteId);
      expect(listed.value.loanId).toBe(loan.id);
      expect(listed.value.version).toBe(0);
    }
  });

  it('refuses an ask one minor unit above the current value and names the cap', () => {
    const loan = originate();
    const cap = loan.calculateAmountDue(tenDaysIn);
    const listed = NoteSale.list(listInput({ askPrice: cap.plus(Money.of(1n, usd)) }));

    expect(listed.ok).toBe(false);
    if (!listed.ok) {
      expect(listed.error.code).toBe('ASK_EXCEEDS_CURRENT_VALUE');
      if ('currentValue' in listed.error) {
        expect(listed.error.currentValue.equals(cap)).toBe(true);
      }
    }
  });

  it('refuses to list while the transfer parameter is off', () => {
    const listed = NoteSale.list(
      listInput({ parameters: { ...parameters, notesTransferable: false } }),
    );
    expect(!listed.ok && listed.error.code).toBe('NOTE_TRANSFER_DISABLED');
  });

  it('refuses to list a note minted non transferable', () => {
    const loan = originate();
    const listed = NoteSale.list(listInput({ note: noteFor(loan, { transferable: false }) }));
    expect(!listed.ok && listed.error.code).toBe('NOTE_TRANSFER_DISABLED');
  });

  it('refuses a lister who does not hold the note', () => {
    const listed = NoteSale.list(listInput({ sellerAccountId: accountIdOf('STRANGER') }));
    expect(!listed.ok && listed.error.code).toBe('FORBIDDEN');
  });

  it('refuses a loan that is no longer active', () => {
    const loan = originate();
    const repaid = loan.recordRepayment(loan.calculateAmountDue(tenDaysIn), tenDaysIn);
    if (!repaid.ok) {
      throw repaid.error;
    }
    const closed = repaid.value.loan;
    const listed = NoteSale.list(listInput({ loan: closed, note: noteFor(closed) }));
    expect(!listed.ok && listed.error.code).toBe('LOAN_NOT_ACTIVE');
  });

  it('refuses a non positive ask at construction', () => {
    expect(() => NoteSale.list(listInput({ askPrice: Money.zero(usd) }))).toThrow();
  });
});

describe('NoteSale transitions', () => {
  const statuses: readonly NoteSaleStatus[] = ['OPEN', 'SOLD', 'WITHDRAWN', 'VOIDED'];

  it('only an open sale moves at all', () => {
    for (const status of statuses) {
      const expected = status === 'OPEN' ? ['purchase', 'withdraw', 'void'] : [];
      expect(allowedNoteSaleTransitions[status]).toEqual(expected);
    }
  });

  it('lets the seller withdraw an open sale', () => {
    const withdrawn = saleIn('OPEN').withdraw(accountIdOf('SELLER'));
    expect(withdrawn.ok && withdrawn.value.status).toBe('WITHDRAWN');
  });

  it('refuses a withdrawal from anybody but the seller', () => {
    const withdrawn = saleIn('OPEN').withdraw(accountIdOf('STRANGER'));
    expect(!withdrawn.ok && withdrawn.error.code).toBe('FORBIDDEN');
  });

  it('refuses to withdraw a sale that already settled', () => {
    const withdrawn = saleIn('SOLD').withdraw(accountIdOf('SELLER'));
    expect(!withdrawn.ok && withdrawn.error.code).toBe('NOTE_SALE_NOT_OPEN');
  });

  it('marks an open sale sold', () => {
    const sold = saleIn('OPEN').markSold();
    expect(sold.ok && sold.value.status).toBe('SOLD');
  });

  it('refuses to sell a withdrawn sale', () => {
    const sold = saleIn('WITHDRAWN').markSold();
    expect(!sold.ok && sold.error.code).toBe('NOTE_SALE_NOT_OPEN');
  });

  it('voids an open sale', () => {
    const voided = saleIn('OPEN').markVoided();
    expect(voided.ok && voided.value.status).toBe('VOIDED');
  });

  it('refuses to void a sold sale', () => {
    const voided = saleIn('SOLD').markVoided();
    expect(!voided.ok && voided.error.code).toBe('NOTE_SALE_NOT_OPEN');
  });
});
