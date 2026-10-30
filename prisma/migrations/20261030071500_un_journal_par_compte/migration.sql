-- Un journal par compte.
--
-- Les lignes qui existent déjà sont celles du propriétaire : la valeur par
-- défaut les y laisse, et c'est pour cela qu'elle est écrite ici plutôt que
-- laissée au code — une colonne ajoutée sans elle rattacherait 77 trades à
-- personne.

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN "ownerId" TEXT NOT NULL DEFAULT 'owner';

-- CreateIndex
CREATE INDEX "Trade_ownerId_date_idx" ON "Trade"("ownerId", "date");

-- AlterTable
ALTER TABLE "TradeIdea" ADD COLUMN "ownerId" TEXT NOT NULL DEFAULT 'owner';

-- AlterTable
ALTER TABLE "JournalUser" ADD COLUMN "invitedBy" TEXT NOT NULL DEFAULT 'owner';

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "ownerId" TEXT NOT NULL DEFAULT 'owner';

-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN "ownerId" TEXT NOT NULL DEFAULT 'owner';

-- RedefineTable : la vue partagée est désormais une par journal, et le journal
-- est sa clé. L'unique ligne existante est celle du propriétaire.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SharedView" (
    "ownerId" TEXT NOT NULL PRIMARY KEY,
    "filters" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SharedView" ("ownerId", "filters", "updatedAt")
SELECT 'owner', "filters", "updatedAt" FROM "SharedView" WHERE "id" = 'default';
DROP TABLE "SharedView";
ALTER TABLE "new_SharedView" RENAME TO "SharedView";
PRAGMA foreign_keys=ON;
