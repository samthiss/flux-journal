-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "time" TEXT,
    "symbol" TEXT NOT NULL,
    "market" TEXT,
    "side" TEXT NOT NULL,
    "size" REAL NOT NULL,
    "entry" REAL,
    "exit" REAL,
    "pnl" REAL NOT NULL,
    "rr" REAL,
    "setup" TEXT NOT NULL,
    "emotion" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TradeImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    CONSTRAINT "TradeImage_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ChecklistLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "itemId" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistLog_date_itemId_key" ON "ChecklistLog"("date", "itemId");
