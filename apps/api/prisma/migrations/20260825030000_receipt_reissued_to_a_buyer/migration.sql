-- One live receipt per intake, rather than one receipt per intake ever.
--
-- A sale extinguishes the borrower's title and has to grant the buyer theirs,
-- which means the same physical item carries a burned receipt and a fresh one
-- at the same time. The plain unique index forbade that, so the buyer walked
-- away holding nothing (docs/OPEN-QUESTIONS.md Q-006).
--
-- The invariant that matters is unchanged: an item cannot be represented by
-- two live receipts at once. A burned receipt is history, and history does
-- not compete for the item. Prisma cannot express a partial index, so it
-- lives here and in the issue use case.
DROP INDEX "custody_receipt_intake_record_hash_key";

CREATE UNIQUE INDEX "custody_receipt_one_live_per_intake"
    ON "custody_receipt"("intake_record_hash")
    WHERE status IN ('IN_VAULT', 'ENCUMBERED');

CREATE INDEX "custody_receipt_intake_record_hash_idx"
    ON "custody_receipt"("intake_record_hash");
