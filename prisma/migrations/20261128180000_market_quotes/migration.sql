-- Le dernier prix connu de chaque marché, source gratuite et différée.
CREATE TABLE "MarketQuote" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "price" REAL NOT NULL,
    "at" DATETIME NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "error" TEXT
);

-- La notification d'approche d'une ligne.
ALTER TABLE "PushPrefs" ADD COLUMN "approche" BOOLEAN NOT NULL DEFAULT true;
