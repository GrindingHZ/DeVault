-- The chain settlement adapter's own memory.
--
-- chain_funds_hold maps the api's funds hold id to the FundsHold object and
-- answers a repeat refund or release with the digest of the first one, the
-- exactly once promise the settlement port makes. chain_settlement maps a
-- digest to the ledger kind it settled and the mirror ledger transaction it
-- wrote, which is what an auditor and the reconciliation read.
CREATE TYPE "chain_funds_hold_status" AS ENUM ('HELD', 'RELEASED', 'REFUNDED');

CREATE TABLE "chain_funds_hold" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "minor_units" BIGINT NOT NULL,
    "object_id" TEXT,
    "status" "chain_funds_hold_status" NOT NULL,
    "hold_digest" TEXT,
    "settled_digest" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_funds_hold_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chain_funds_hold_object_id_key" ON "chain_funds_hold"("object_id");

CREATE INDEX "chain_funds_hold_account_id_status_idx" ON "chain_funds_hold"("account_id", "status");

CREATE TABLE "chain_settlement" (
    "id" TEXT NOT NULL,
    "digest" TEXT,
    "kind" "ledger_transaction_kind" NOT NULL,
    "reference" TEXT NOT NULL,
    "ledger_transaction_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_settlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chain_settlement_ledger_transaction_id_key" ON "chain_settlement"("ledger_transaction_id");

CREATE INDEX "chain_settlement_digest_idx" ON "chain_settlement"("digest");
