-- A backtest trade the trader has gone over: one row per trade, by its key ("twt|6B|29746657", "zones|6E|29385162").
CREATE TABLE "BacktestReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "key" TEXT NOT NULL,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BacktestReview_ownerId_key_key" ON "BacktestReview"("ownerId", "key");
