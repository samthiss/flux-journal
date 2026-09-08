-- CreateTable
CREATE TABLE "EventRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'moi',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EventRating_currency_title_key" ON "EventRating"("currency", "title");
