import type { LoanResponse } from '@depawn/contracts';
import type { Position } from './position';

/* The figures across the top. Both sides at once, because one person is both
   and a reader on the lending tab still wants to know what they owe. */
export interface PortfolioTotals {
  readonly borrowedMinorUnits: bigint;
  readonly owedTodayMinorUnits: bigint;
  readonly lentMinorUnits: bigint;
  readonly accruedMinorUnits: bigint;
  readonly needsAttentionCount: number;
  /* Every amount in this product carries its currency. Null when there is
     nothing to total, which is different from zero of something. */
  readonly currency: string | null;
}

export interface PortfolioInput {
  readonly borrowedLoans: readonly LoanResponse[];
  readonly lentLoans: readonly LoanResponse[];
  readonly positions: readonly Position[];
}

/* Only a running loan is still owed or still out. A repaid one is history,
   and counting it would inflate both sides of the strip forever. */
function isOutstanding(loan: LoanResponse): boolean {
  return loan.status === 'ACTIVE' || loan.status === 'DEFAULTED';
}

function sum(values: readonly string[]): bigint {
  return values.reduce((total, value) => total + BigInt(value), 0n);
}

export function totalsOf(input: PortfolioInput): PortfolioTotals {
  const borrowed = input.borrowedLoans.filter(isOutstanding);
  const lent = input.lentLoans.filter(isOutstanding);

  const borrowedMinorUnits = sum(borrowed.map((loan) => loan.principal.minorUnits));
  const owedInterest = sum(borrowed.map((loan) => loan.accruedInterest.minorUnits));

  return {
    borrowedMinorUnits,
    /* Principal plus what it has earned so far. Indicative: repayment still
       fetches a quote, which is the only figure anybody is held to. */
    owedTodayMinorUnits: borrowedMinorUnits + owedInterest,
    lentMinorUnits: sum(lent.map((loan) => loan.principal.minorUnits)),
    accruedMinorUnits: sum(lent.map((loan) => loan.accruedInterest.minorUnits)),
    needsAttentionCount: input.positions.filter((position) => position.needsAttention).length,
    currency: borrowed[0]?.principal.currency ?? lent[0]?.principal.currency ?? null,
  };
}
