-- Who an account is on chain, and where its available balance lives.
--
-- An address is derived from the seed for an account that never signed in
-- with a wallet, and replaced by the wallet's own address when one does. The
-- wallet row records the shared Wallet object per account and coin; the
-- object id is null between the transaction that opens it and the commit
-- that learns the id from the effects.
CREATE TABLE "chain_account_address" (
    "account_id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_account_address_pkey" PRIMARY KEY ("account_id")
);

CREATE UNIQUE INDEX "chain_account_address_address_key" ON "chain_account_address"("address");

CREATE TABLE "chain_wallet" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "object_id" TEXT,
    "opened_digest" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_wallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chain_wallet_account_id_currency_key" ON "chain_wallet"("account_id", "currency");

CREATE UNIQUE INDEX "chain_wallet_object_id_key" ON "chain_wallet"("object_id");
