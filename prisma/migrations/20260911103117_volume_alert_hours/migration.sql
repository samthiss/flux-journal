-- CreateTable
CREATE TABLE "VolumeAlertHour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "values" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "VolumeAlertHour_day_idx" ON "VolumeAlertHour"("day");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeAlertHour_market_day_hour_key" ON "VolumeAlertHour"("market", "day", "hour");
