-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NoteExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "tags" TEXT,
    "hideText" BOOLEAN NOT NULL DEFAULT false,
    "imagesPerRow" INTEGER NOT NULL DEFAULT 2,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_NoteExample" ("caption", "categoryId", "createdAt", "id", "noteId", "order", "tags", "title") SELECT "caption", "categoryId", "createdAt", "id", "noteId", "order", "tags", "title" FROM "NoteExample";
DROP TABLE "NoteExample";
ALTER TABLE "new_NoteExample" RENAME TO "NoteExample";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
