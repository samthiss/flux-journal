-- The day's orders replace the bare "trade on" rows: an order carries its own fill time.
DROP TABLE "OpenPosition";

CREATE TABLE "PlanOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "level" REAL NOT NULL,
    "entry" REAL NOT NULL,
    "sl" REAL NOT NULL,
    "tp1" REAL NOT NULL,
    "tp2" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filledAt" DATETIME,
    "closedAt" DATETIME,
    "outcome" TEXT,
    "pnl" REAL,
    "tradeId" TEXT,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlanOrder_day_idx" ON "PlanOrder"("day");

CREATE TABLE "PushPrefs" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "exit" BOOLEAN NOT NULL DEFAULT true,
    "news" BOOLEAN NOT NULL DEFAULT true,
    "pull" BOOLEAN NOT NULL DEFAULT true
);
