/*
  Warnings:

  - You are about to drop the `appraisal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `borrower_note` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `chain_funds_hold` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `chain_receipt` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `chain_settlement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `custody_receipt` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `funds_hold` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `intake_record` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ledger_account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ledger_entry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ledger_transaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `lender_note` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `liquidation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `liquidation_bid` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `listing` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `loan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_sale` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `offer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `reconciliation_drift` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `reconciliation_run` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `redemption_request` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vault` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "appraisal" DROP CONSTRAINT "appraisal_intake_id_fkey";

-- DropForeignKey
ALTER TABLE "custody_receipt" DROP CONSTRAINT "custody_receipt_vault_id_fkey";

-- DropForeignKey
ALTER TABLE "intake_record" DROP CONSTRAINT "intake_record_vault_id_fkey";

-- DropForeignKey
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_account_id_fkey";

-- DropForeignKey
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "liquidation_bid" DROP CONSTRAINT "liquidation_bid_liquidation_id_fkey";

-- DropForeignKey
ALTER TABLE "offer" DROP CONSTRAINT "offer_listing_id_fkey";

-- DropForeignKey
ALTER TABLE "reconciliation_drift" DROP CONSTRAINT "reconciliation_drift_run_id_fkey";

-- DropTable
DROP TABLE "appraisal";

-- DropTable
DROP TABLE "borrower_note";

-- DropTable
DROP TABLE "chain_funds_hold";

-- DropTable
DROP TABLE "chain_receipt";

-- DropTable
DROP TABLE "chain_settlement";

-- DropTable
DROP TABLE "custody_receipt";

-- DropTable
DROP TABLE "funds_hold";

-- DropTable
DROP TABLE "intake_record";

-- DropTable
DROP TABLE "ledger_account";

-- DropTable
DROP TABLE "ledger_entry";

-- DropTable
DROP TABLE "ledger_transaction";

-- DropTable
DROP TABLE "lender_note";

-- DropTable
DROP TABLE "liquidation";

-- DropTable
DROP TABLE "liquidation_bid";

-- DropTable
DROP TABLE "listing";

-- DropTable
DROP TABLE "loan";

-- DropTable
DROP TABLE "note_sale";

-- DropTable
DROP TABLE "offer";

-- DropTable
DROP TABLE "reconciliation_drift";

-- DropTable
DROP TABLE "reconciliation_run";

-- DropTable
DROP TABLE "redemption_request";

-- DropTable
DROP TABLE "vault";

-- DropEnum
DROP TYPE "chain_funds_hold_status";

-- DropEnum
DROP TYPE "entry_direction";

-- DropEnum
DROP TYPE "funds_hold_status";

-- DropEnum
DROP TYPE "intake_status";

-- DropEnum
DROP TYPE "item_category";

-- DropEnum
DROP TYPE "ledger_account_owner_type";

-- DropEnum
DROP TYPE "ledger_account_purpose";

-- DropEnum
DROP TYPE "ledger_transaction_kind";

-- DropEnum
DROP TYPE "liquidation_status";

-- DropEnum
DROP TYPE "listing_status";

-- DropEnum
DROP TYPE "loan_status";

-- DropEnum
DROP TYPE "note_sale_status";

-- DropEnum
DROP TYPE "offer_status";

-- DropEnum
DROP TYPE "receipt_status";

-- DropEnum
DROP TYPE "redemption_status";
