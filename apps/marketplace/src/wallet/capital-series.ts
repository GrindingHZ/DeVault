import { interestOver } from '@depawn/ui';
import type { LedgerEntryResponse, LoanResponse } from '@depawn/contracts';

/* What a lender is worth over time, rebuilt in the browser from the ledger.

   The wallet balance on its own is the wrong line to draw. It is a step
   function that only moves when somebody acts, and it moves the wrong way:
   cash leaves the wallet when money is successfully lent and comes back when
   a loan is repaid, so a lender who has put every dollar to work would watch
   their best month render as a collapse.

   What does move sensibly is everything they own. Cash that is idle, cash
   committed to offers, principal out on loans, and the interest those loans
   have accrued. Deploying cash moves it between those bands and leaves the
   total alone; the total rises only as interest accrues, which it does every
   day, which is what gives this line a shape a staircase does not have.

   There is no history endpoint. There does not need to be one: the ledger is
   double entry in integer minor units, so replaying it forward from zero
   reproduces every balance the account has ever had, exactly. */

export interface CapitalPoint {
  readonly atMs: number;
  /* Available plus held. Both are the reader's money and both are spendable
     eventually, so the chart does not split them; the breakdown beside it
     does. */
  readonly cashMinorUnits: bigint;
  /* Principal out on loans that had not come back yet at this moment. */
  readonly lentMinorUnits: bigint;
  /* What those loans had earned by this moment, and not a penny of what they
     will earn later. */
  readonly interestMinorUnits: bigint;
  readonly totalMinorUnits: bigint;
}

export interface CapitalSeriesInput {
  readonly entries: readonly LedgerEntryResponse[];
  /* Loans where the reader is the lender. A borrower has none, and their
     total is simply their cash, which is the honest answer. */
  readonly loans: readonly LoanResponse[];
  /* The server's clock. Never the browser's: a demo process runs its clock
     weeks ahead (docs/10-flows.md flow 15), so a series built against
     `Date.now()` would end weeks before the figures beside it. */
  readonly asOfMs: number;
  /* How far back to draw, or null for everything there is. */
  readonly windowMs: number | null;
}

const oneDay = 24 * 60 * 60 * 1000;

/* A user account is a liability of the platform, so the signs read the way a
   person expects rather than the way a bookkeeper writes them: money coming
   in is a credit to them (packages/contracts/src/status-copy.ts renders the
   pair as "In" and "Out"). */
function signedAmount(entry: LedgerEntryResponse): bigint {
  const magnitude = BigInt(entry.amount.minorUnits);
  return entry.direction === 'CREDIT' ? magnitude : -magnitude;
}

interface CashStep {
  readonly atMs: number;
  readonly cashMinorUnits: bigint;
}

/* Every balance the account has held, in order. Replayed forward from zero
   rather than unwound backward from today, because forward has a property
   worth having: the last step must equal the balance the server reports, and
   `reconcilesWith` below turns that into an assertion rather than a hope. */
function cashStepsOf(entries: readonly LedgerEntryResponse[]): readonly CashStep[] {
  const chronological = [...entries].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  );

  const steps: CashStep[] = [];
  let running = 0n;
  for (const entry of chronological) {
    running += signedAmount(entry);
    steps.push({ atMs: Date.parse(entry.occurredAt), cashMinorUnits: running });
  }
  return steps;
}

function cashAt(steps: readonly CashStep[], atMs: number): bigint {
  let held = 0n;
  for (const step of steps) {
    if (step.atMs > atMs) {
      break;
    }
    held = step.cashMinorUnits;
  }
  return held;
}

/* When each loan stopped being outstanding, taken from the ledger rather
   than from the loan: a loan carries when it started and when it matures,
   and nothing at all about when it was actually repaid. The repayment does
   carry it, because the entry that moves the money names the loan it settles
   (apps/api/src/modules/lending/application/repay-loan.use-case.ts). */
function closedAtByLoanId(entries: readonly LedgerEntryResponse[]): ReadonlyMap<string, number> {
  const closed = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== 'REPAY_LOAN' && entry.kind !== 'SETTLE_LIQUIDATION') {
      continue;
    }
    const at = Date.parse(entry.occurredAt);
    const already = closed.get(entry.reference);
    if (already === undefined || at < already) {
      closed.set(entry.reference, at);
    }
  }
  return closed;
}

interface NoteValue {
  readonly lentMinorUnits: bigint;
  readonly interestMinorUnits: bigint;
}

function notesAt(
  loans: readonly LoanResponse[],
  closed: ReadonlyMap<string, number>,
  atMs: number,
): NoteValue {
  let lent = 0n;
  let interest = 0n;

  for (const loan of loans) {
    const startedAt = Date.parse(loan.startedAt);
    if (!Number.isFinite(startedAt) || startedAt > atMs) {
      continue;
    }
    const closedAt = closed.get(loan.id);
    if (closedAt !== undefined && atMs >= closedAt) {
      /* The money is back in the wallet by now, and the cash line already
         counts it. Counting the note as well would pay the reader twice. */
      continue;
    }

    lent += BigInt(loan.principal.minorUnits);
    /* Interest stops at maturity (rule L1), so the clock the accrual is
       measured against stops there too. */
    const maturesAt = Date.parse(loan.maturesAt);
    const until = Number.isFinite(maturesAt) ? Math.min(atMs, maturesAt) : atMs;
    interest += interestOver(
      loan.principal.minorUnits,
      loan.annualPercentageRateBasisPoints,
      Math.max(0, until - startedAt),
    );
  }

  return { lentMinorUnits: lent, interestMinorUnits: interest };
}

/* One point per day, plus the present moment.

   Per day rather than per ledger entry because the interest is the part that
   moves: sampling only where somebody acted would draw the accrual as a
   straight line between two transactions and hide the very thing the chart
   exists to show. */
export function buildCapitalSeries(input: CapitalSeriesInput): readonly CapitalPoint[] {
  const steps = cashStepsOf(input.entries);
  const closed = closedAtByLoanId(input.entries);

  const earliestKnown = steps[0]?.atMs;
  if (earliestKnown === undefined) {
    return [];
  }

  const windowStart =
    input.windowMs === null
      ? earliestKnown
      : Math.max(earliestKnown, input.asOfMs - input.windowMs);
  /* A window wider than the account is old starts where the account does,
     so a new reader sees a short honest line rather than a long flat one. */
  const from = Math.min(windowStart, input.asOfMs);

  const stamps: number[] = [];
  for (let at = from; at < input.asOfMs; at += oneDay) {
    stamps.push(at);
  }
  stamps.push(input.asOfMs);

  return stamps.map((atMs) => {
    const cash = cashAt(steps, atMs);
    const notes = notesAt(input.loans, closed, atMs);
    return {
      atMs,
      cashMinorUnits: cash,
      lentMinorUnits: notes.lentMinorUnits,
      interestMinorUnits: notes.interestMinorUnits,
      totalMinorUnits: cash + notes.lentMinorUnits + notes.interestMinorUnits,
    };
  });
}

/* The check that makes replaying the ledger trustworthy. Anything missing
   from the page of entries the browser happens to hold shows up here as a
   disagreement with the balance the server reports, and the caller can say
   so rather than drawing a line that is quietly short.

   Both figures are integers in minor units, so this is exact and there is no
   tolerance to argue about. */
export function reconcilesWith(
  entries: readonly LedgerEntryResponse[],
  availableMinorUnits: string,
  heldMinorUnits: string,
): boolean {
  const replayed = entries.reduce((total, entry) => total + signedAmount(entry), 0n);
  return replayed === BigInt(availableMinorUnits) + BigInt(heldMinorUnits);
}

export interface CapitalChange {
  readonly openingMinorUnits: bigint;
  readonly closingMinorUnits: bigint;
  readonly deltaMinorUnits: bigint;
}

export function changeOver(points: readonly CapitalPoint[]): CapitalChange | null {
  const opening = points[0];
  const closing = points[points.length - 1];
  if (opening === undefined || closing === undefined) {
    return null;
  }
  return {
    openingMinorUnits: opening.totalMinorUnits,
    closingMinorUnits: closing.totalMinorUnits,
    deltaMinorUnits: closing.totalMinorUnits - opening.totalMinorUnits,
  };
}
