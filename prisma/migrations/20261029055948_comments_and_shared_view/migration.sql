-- CreateTable
CREATE TABLE "TradeComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    CONSTRAINT "TradeComment_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SharedView" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "filters" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TradeComment_tradeId_createdAt_idx" ON "TradeComment"("tradeId", "createdAt");
