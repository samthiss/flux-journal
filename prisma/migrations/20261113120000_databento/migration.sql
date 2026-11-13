-- CreateTable
CREATE TABLE "DatabentoSymbol" (
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "zones" TEXT NOT NULL DEFAULT '[]',
    "result" TEXT,
    "chosenKey" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DatabentoSymbol_ownerId_symbol_key" ON "DatabentoSymbol"("ownerId", "symbol");
