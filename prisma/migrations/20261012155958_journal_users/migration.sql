-- CreateTable
CREATE TABLE "JournalUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Invitation" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME,
    "usedBy" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "JournalUser_email_key" ON "JournalUser"("email");
