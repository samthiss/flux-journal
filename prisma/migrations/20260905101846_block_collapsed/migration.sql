-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NoteBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "categoryId" TEXT,
    "exampleId" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteBlock_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteBlock_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NoteCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteBlock_exampleId_fkey" FOREIGN KEY ("exampleId") REFERENCES "NoteExample" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NoteBlock" ("categoryId", "content", "createdAt", "exampleId", "id", "noteId", "order", "type") SELECT "categoryId", "content", "createdAt", "exampleId", "id", "noteId", "order", "type" FROM "NoteBlock";
DROP TABLE "NoteBlock";
ALTER TABLE "new_NoteBlock" RENAME TO "NoteBlock";
CREATE INDEX "NoteBlock_noteId_idx" ON "NoteBlock"("noteId");
CREATE INDEX "NoteBlock_categoryId_idx" ON "NoteBlock"("categoryId");
CREATE INDEX "NoteBlock_exampleId_idx" ON "NoteBlock"("exampleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
