-- CreateTable
CREATE TABLE "VolumeAlertDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "values" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "VolumeAlertDay_day_idx" ON "VolumeAlertDay"("day");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeAlertDay_market_day_key" ON "VolumeAlertDay"("market", "day");
