-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TradeIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'plan',
    "tradeTypes" TEXT,
    "zone" TEXT,
    "confirmations" TEXT,
    "reason" TEXT NOT NULL,
    "cancelIf" TEXT,
    "images" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeIdea_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TradeIdea" ("cancelIf", "confirmations", "createdAt", "day", "id", "images", "itemId", "market", "reason", "side", "tradeTypes", "zone") SELECT "cancelIf", "confirmations", "createdAt", "day", "id", "images", "itemId", "market", "reason", "side", "tradeTypes", "zone" FROM "TradeIdea";
DROP TABLE "TradeIdea";
ALTER TABLE "new_TradeIdea" RENAME TO "TradeIdea";
CREATE INDEX "TradeIdea_itemId_idx" ON "TradeIdea"("itemId");
CREATE INDEX "TradeIdea_market_day_idx" ON "TradeIdea"("market", "day");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
