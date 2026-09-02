import { interestOver } from '@depawn/ui';
import type { LoanResponse } from '@depawn/contracts';
import type { Position, PositionSide } from './position';

/* The figures across the top, one set per side.

   A trader reads a position as cost basis, mark and unrealised. A loan reads
   the same way: what went out, what it has earned or cost so far, and what is
   still to come if it runs to term. The two sides are the same three numbers
   with opposite signs, which is why they are one function and not two. */
export interface PortfolioTotals {
  /* Principal outstanding. What is at work, not what has ever been lent. */
  readonly principalMinorUnits: bigint;
  /* Interest accrued to the moment the server answered. The borrower's cost
     so far, the lender's earnings so far. */
  readonly interestSoFarMinorUnits: bigint;
  /* What the rest of the term adds if every loan runs to maturity. */
  readonly interestToComeMinorUnits: bigint;
  /* Borrower: principal plus interest so far, which is what settling every
     loan today would cost. Lender: principal plus the whole term's interest,
     which is what comes back if nothing goes wrong. */
  readonly settlementMinorUnits: bigint;
  readonly needsAttentionCount: number;
  /* Every amount in this product carries its currency. Null when there is
     nothing to total, which is different from zero of something. */
  readonly currency: string | null;
}

export interface PortfolioInput {
  readonly loans: readonly LoanResponse[];
  readonly positions: readonly Position[];
  readonly side: PositionSide;
}

/* Only a running loan is still owed or still out. A repaid one is history,
   and counting it would inflate the strip forever. A defaulted one is money
   that has not come back, so it stays. */
function isOutstanding(loan: LoanResponse): boolean {
  return loan.status === 'ACTIVE' || loan.status === 'DEFAULTED';
}

function wholeTermInterest(loan: LoanResponse): bigint {
  return interestOver(
    loan.principal.minorUnits,
    loan.annualPercentageRateBasisPoints,
    Date.parse(loan.maturesAt) - Date.parse(loan.startedAt),
  );
}

export function totalsOf(input: PortfolioInput): PortfolioTotals {
  const outstanding = input.loans.filter(isOutstanding);

  let principal = 0n;
  let soFar = 0n;
  let wholeTerm = 0n;
  for (const loan of outstanding) {
    principal += BigInt(loan.principal.minorUnits);
    soFar += BigInt(loan.accruedInterest.minorUnits);
    wholeTerm += wholeTermInterest(loan);
  }
  /* Never negative. Interest clamps at maturity (rule L1), so a loan past it
     has already accrued its whole term. */
  const toCome = wholeTerm > soFar ? wholeTerm - soFar : 0n;

  return {
    principalMinorUnits: principal,
    interestSoFarMinorUnits: soFar,
    interestToComeMinorUnits: toCome,
    settlementMinorUnits: input.side === 'borrowing' ? principal + soFar : principal + wholeTerm,
    needsAttentionCount: input.positions.filter((position) => position.needsAttention).length,
    currency: outstanding[0]?.principal.currency ?? null,
  };
}
