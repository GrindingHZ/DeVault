import interest from './fixtures/interest.json';
import waterfall from './fixtures/waterfall.json';

/* One file for the arithmetic both runtimes have to agree on. The TypeScript
   suites read it directly; scripts/generate-move-fixtures.ts turns it into
   Move tests, so a case added here reaches the chain or fails the build
   (docs/07-phase-plan.md P9, docs/06-testing.md). Amounts are strings because
   JSON numbers cannot hold a bigint safely. */
export interface InterestFixture {
  readonly name: string;
  readonly principalMinorUnits: string;
  readonly annualPercentageRateBasisPoints: number;
  readonly startedAtMs: string;
  readonly maturesAtMs: string;
  readonly nowMs: string;
  readonly expectedInterestMinorUnits: string;
}

export interface WaterfallFixture {
  readonly name: string;
  readonly proceedsMinorUnits: string;
  readonly amountOwedMinorUnits: string;
  readonly liquidationFeeBasisPoints: number;
  readonly expectedLenderMinorUnits: string;
  readonly expectedFeeMinorUnits: string;
  readonly expectedSurplusMinorUnits: string;
  readonly expectedRoundingMinorUnits: string;
}

export const interestFixtures: readonly InterestFixture[] = interest;
export const waterfallFixtures: readonly WaterfallFixture[] = waterfall;
