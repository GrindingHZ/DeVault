-- Where the api learns which package it is talking to. Written by the
-- publish script, read once at boot by every chain adapter. One row, keyed
-- ACTIVE, because a process talks to one deployment on one network.
CREATE TABLE "chain_deployment" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "admin_cap_id" TEXT NOT NULL,
    "operator_cap_id" TEXT NOT NULL,
    "custodian_cap_id" TEXT NOT NULL,
    -- Present only for the local stand in coin; a public network's USDC has
    -- no treasury the operator holds.
    "treasury_cap_id" TEXT,
    "settlement_coin_type" TEXT NOT NULL,
    "settlement_coin_decimals" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "published_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_deployment_pkey" PRIMARY KEY ("id")
);
