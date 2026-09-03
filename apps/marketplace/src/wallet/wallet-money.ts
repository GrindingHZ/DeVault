import { interestOver } from '@depawn/ui';

/* Every wallet figure except the free balance, derived from the objects a
   member's transitions leave on chain. The frontend reads a member's owned
   notes and receipts, then the pledge each note points at, and turns them into
   these figures here. The arithmetic is the contract's own: `interestOver`
   mirrors `interest.move`, so a figure shown here is the figure the chain will
   charge (docs/superpowers/specs/2026-08-26-wallet-self-custody-design.md). */

export type PledgeStatus = 'open' | 'active' | 'repaid' | 'defaulted';

/* A pledge as the wallet reads it, already parsed out of the object content. */
export interface PledgeTerms {
  readonly pledgeId: string;
  readonly status: PledgeStatus;
  readonly principalBaseUnits: bigint;
  readonly aprBps: number;
  readonly startedAtMs: number;
  readonly maturesAtMs: number;
  readonly gracePeriodMs: number;
  /* The payoff a repayment left for the lender to pull. Zero until then. */
  readonly parkedBaseUnits: bigint;
}

/* The pledge status byte the contract stores, named. */
export function pledgeStatusOf(status: number): PledgeStatus {
  switch (status) {
    case 0:
      return 'open';
    case 1:
      return 'active';
    case 2:
      return 'repaid';
    case 3:
      return 'defaulted';
    default:
      return 'open';
  }
}

/* Interest stops at maturity and never runs before origination, the same clamp
   the contract applies. */
function elapsedMs(startedAtMs: number, maturesAtMs: number, nowMs: number): number {
  const end = Math.min(nowMs, maturesAtMs);
  return Math.max(0, end - startedAtMs);
}

function accruedBaseUnits(terms: PledgeTerms, untilMs: number): bigint {
  return interestOver(
    terms.principalBaseUnits.toString(),
    terms.aprBps,
    elapsedMs(terms.startedAtMs, terms.maturesAtMs, untilMs),
  );
}

/* What the member is owed as the holder of a lender note on this pledge. On an
   active loan the principal is at work and interest accrues; on a repaid loan
   the payoff is parked and ready to collect; a defaulted loan pays no cash and
   becomes a claimable item instead. */
export interface LenderStanding {
  readonly pledgeId: string;
  readonly status: PledgeStatus;
  readonly principalBaseUnits: bigint;
  readonly earnedSoFarBaseUnits: bigint;
  readonly valueAtMaturityBaseUnits: bigint;
  readonly collectableBaseUnits: bigint;
}

export function lenderStanding(terms: PledgeTerms, nowMs: number): LenderStanding {
  const fullTermInterest = accruedBaseUnits(terms, terms.maturesAtMs);
  const earnedSoFar = terms.status === 'active' ? accruedBaseUnits(terms, nowMs) : 0n;
  return {
    pledgeId: terms.pledgeId,
    status: terms.status,
    principalBaseUnits: terms.status === 'active' ? terms.principalBaseUnits : 0n,
    earnedSoFarBaseUnits: earnedSoFar,
    valueAtMaturityBaseUnits:
      terms.status === 'active' ? terms.principalBaseUnits + fullTermInterest : 0n,
    collectableBaseUnits: terms.status === 'repaid' ? terms.parkedBaseUnits : 0n,
  };
}

/* What the member owes as the holder of a borrower note on this pledge. Owed
   today settles the loan now; owed at maturity is the full term. Past the grace
   end the loan can be defaulted and the item lost. */
export interface BorrowerStanding {
  readonly pledgeId: string;
  readonly status: PledgeStatus;
  readonly principalBaseUnits: bigint;
  readonly owedNowBaseUnits: bigint;
  readonly owedAtMaturityBaseUnits: bigint;
  readonly maturesAtMs: number;
  readonly graceEndsAtMs: number;
}

export function borrowerStanding(terms: PledgeTerms, nowMs: number): BorrowerStanding {
  const active = terms.status === 'active';
  const owedNow = active ? terms.principalBaseUnits + accruedBaseUnits(terms, nowMs) : 0n;
  const owedAtMaturity = active
    ? terms.principalBaseUnits + accruedBaseUnits(terms, terms.maturesAtMs)
    : 0n;
  return {
    pledgeId: terms.pledgeId,
    status: terms.status,
    principalBaseUnits: active ? terms.principalBaseUnits : 0n,
    owedNowBaseUnits: owedNow,
    owedAtMaturityBaseUnits: owedAtMaturity,
    maturesAtMs: terms.maturesAtMs,
    graceEndsAtMs: terms.maturesAtMs + terms.gracePeriodMs,
  };
}

export interface WalletTotals {
  readonly availableBaseUnits: bigint;
  readonly lentPrincipalBaseUnits: bigint;
  readonly interestEarnedBaseUnits: bigint;
  readonly collectableBaseUnits: bigint;
  readonly owedNowBaseUnits: bigint;
  /* Cash the member controls now or with one pull. Committed and reclaimable
     offers join this in Phase 2, when the indexer can see the shared holds. */
  readonly cashControlledBaseUnits: bigint;
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

export function summarizeWallet(input: {
  readonly availableBaseUnits: bigint;
  readonly lender: readonly LenderStanding[];
  readonly borrower: readonly BorrowerStanding[];
}): WalletTotals {
  const collectable = sum(input.lender.map((standing) => standing.collectableBaseUnits));
  return {
    availableBaseUnits: input.availableBaseUnits,
    lentPrincipalBaseUnits: sum(input.lender.map((standing) => standing.principalBaseUnits)),
    interestEarnedBaseUnits: sum(input.lender.map((standing) => standing.earnedSoFarBaseUnits)),
    collectableBaseUnits: collectable,
    owedNowBaseUnits: sum(input.borrower.map((standing) => standing.owedNowBaseUnits)),
    cashControlledBaseUnits: input.availableBaseUnits + collectable,
  };
}
