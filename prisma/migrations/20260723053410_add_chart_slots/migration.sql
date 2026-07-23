/*
  Warnings:

  - You are about to drop the `TradeImage` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Trade" ADD COLUMN "chartBox" TEXT;
ALTER TABLE "Trade" ADD COLUMN "chartCluster" TEXT;
ALTER TABLE "Trade" ADD COLUMN "chartReverse" TEXT;
ALTER TABLE "Trade" ADD COLUMN "chartTrading" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TradeImage";
PRAGMA foreign_keys=on;
