-- Cache of Scholarships & Funding web searches (lib/scholarships.ts).
-- CreateTable
CREATE TABLE "SearchCache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "providerCalls" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SearchCache_fetchedAt_idx" ON "SearchCache"("fetchedAt");


-- As for every table: close the public table API (see 20261003010000_enable_row_level_security).
ALTER TABLE "SearchCache" ENABLE ROW LEVEL SECURITY;
