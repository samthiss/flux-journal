-- CreateTable
CREATE TABLE "TradeIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "tradeTypes" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeIdea_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "allowsIdeas" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT
);
INSERT INTO "new_ChecklistItem" ("group", "id", "label", "options", "order") SELECT "group", "id", "label", "options", "order" FROM "ChecklistItem";
DROP TABLE "ChecklistItem";
ALTER TABLE "new_ChecklistItem" RENAME TO "ChecklistItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TradeIdea_itemId_idx" ON "TradeIdea"("itemId");

-- CreateIndex
CREATE INDEX "TradeIdea_market_day_idx" ON "TradeIdea"("market", "day");
