/*
  Warnings:

  - You are about to drop the column `notes` on the `Trade` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "time" TEXT,
    "symbol" TEXT NOT NULL,
    "market" TEXT,
    "side" TEXT NOT NULL,
    "size" REAL NOT NULL,
    "pnl" REAL NOT NULL,
    "rr" REAL,
    "setup" TEXT NOT NULL,
    "emotion" TEXT,
    "preTradeNotes" TEXT,
    "postTradeNotes" TEXT,
    "chartCluster" TEXT,
    "chartReverse" TEXT,
    "chartBox" TEXT,
    "chartTrading" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Trade" ("chartBox", "chartCluster", "chartReverse", "chartTrading", "createdAt", "date", "emotion", "id", "market", "pnl", "rr", "setup", "side", "size", "symbol", "time") SELECT "chartBox", "chartCluster", "chartReverse", "chartTrading", "createdAt", "date", "emotion", "id", "market", "pnl", "rr", "setup", "side", "size", "symbol", "time" FROM "Trade";
DROP TABLE "Trade";
ALTER TABLE "new_Trade" RENAME TO "Trade";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
