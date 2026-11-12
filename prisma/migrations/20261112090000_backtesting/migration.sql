-- CreateTable
CREATE TABLE "BacktestTrade" (
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "testName" TEXT,
    "symbol" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "side" TEXT,
    "slTicks" REAL NOT NULL,
    "tp1Ticks" REAL NOT NULL,
    "tp2Ticks" REAL NOT NULL,
    "entryOffset" REAL NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "BacktestTrade_ownerId_date_idx" ON "BacktestTrade"("ownerId", "date");
