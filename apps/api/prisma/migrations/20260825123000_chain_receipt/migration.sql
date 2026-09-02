-- The custody adapter's own memory: which VaultReceipt object stands for
-- which receipt row. The object id is null between the transaction that
-- issues it and the commit that learns the id from the ReceiptIssued event;
-- a burned receipt keeps its row with the digest that ended it.
CREATE TABLE "chain_receipt" (
    "receipt_id" TEXT NOT NULL,
    "object_id" TEXT,
    "issued_digest" TEXT,
    "burned_digest" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_receipt_pkey" PRIMARY KEY ("receipt_id")
);

CREATE UNIQUE INDEX "chain_receipt_object_id_key" ON "chain_receipt"("object_id");
