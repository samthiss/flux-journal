-- Reminders on the phone: the devices, the journal's push keys, the trades on, and what was sent.
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PushDevice_endpoint_key" ON "PushDevice"("endpoint");

CREATE TABLE "PushKeys" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL
);

CREATE TABLE "OpenPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "filledAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PushSent" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
