-- The indexer's own memory: every event the package emitted, keyed by the
-- transaction that emitted it and its position in that transaction, so a
-- page processed twice inserts nothing twice; and one cursor per module, the
-- newest event seen, so a restart resumes rather than replays.
CREATE TABLE "chain_event" (
    "id" TEXT NOT NULL,
    "checkpoint" BIGINT,
    "digest" TEXT NOT NULL,
    "event_index" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "json" JSONB NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chain_event_module_checkpoint_idx" ON "chain_event"("module", "checkpoint");

CREATE INDEX "chain_event_digest_idx" ON "chain_event"("digest");

CREATE TABLE "chain_indexer_cursor" (
    "module" TEXT NOT NULL,
    "newest_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_indexer_cursor_pkey" PRIMARY KEY ("module")
);
