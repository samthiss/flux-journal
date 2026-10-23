-- CreateTable
CREATE TABLE "ShareLink" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "seenAt" DATETIME
);
