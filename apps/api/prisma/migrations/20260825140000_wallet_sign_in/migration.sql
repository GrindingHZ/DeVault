-- Signing in with a wallet. An account gains the address it signed in with,
-- which is also the address its on-chain wallet is owned by, and a short
-- lived single use challenge table proves control of an address.
ALTER TABLE "account" ADD COLUMN "wallet_address" TEXT;

CREATE UNIQUE INDEX "account_wallet_address_key" ON "account"("wallet_address");

CREATE TABLE "wallet_challenge" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_challenge_pkey" PRIMARY KEY ("id")
);

-- The open challenge for an address is the newest unused one; the index
-- serves that lookup.
CREATE INDEX "wallet_challenge_address_used_at_idx" ON "wallet_challenge"("address", "used_at");
