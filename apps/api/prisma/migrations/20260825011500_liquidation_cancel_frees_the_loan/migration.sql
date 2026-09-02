-- One sale per loan, unless the sale was called off.
--
-- The plain unique index made CANCELLED a trap: cancelling a scheduled sale
-- would have held the loan's only slot for ever, so the loan could never be
-- liquidated again. A called off sale has to leave the loan where it found
-- it. Prisma cannot express a partial index, so the invariant lives here and
-- in the schedule use case, the same as the one open sale per note.
DROP INDEX "liquidation_loan_id_key";

CREATE UNIQUE INDEX "liquidation_one_live_per_loan"
    ON "liquidation"("loan_id") WHERE status <> 'CANCELLED';

CREATE INDEX "liquidation_loan_id_idx" ON "liquidation"("loan_id");
