-- CreateEnum
CREATE TYPE "note_sale_status" AS ENUM ('OPEN', 'SOLD', 'WITHDRAWN', 'VOIDED');

-- CreateTable
CREATE TABLE "note_sale" (
    "id" TEXT NOT NULL,
    "lender_note_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "seller_account_id" TEXT NOT NULL,
    "ask_price_minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "note_sale_status" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_sale_status_idx" ON "note_sale"("status");

-- CreateIndex
CREATE INDEX "note_sale_seller_account_id_status_idx" ON "note_sale"("seller_account_id", "status");

-- CreateIndex
CREATE INDEX "note_sale_loan_id_status_idx" ON "note_sale"("loan_id", "status");

-- One open sale per note, enforced where the race would land. Prisma cannot
-- express a partial index, so the invariant lives here and in the use case.
CREATE UNIQUE INDEX "note_sale_one_open_per_note"
    ON "note_sale"("lender_note_id") WHERE status = 'OPEN';
