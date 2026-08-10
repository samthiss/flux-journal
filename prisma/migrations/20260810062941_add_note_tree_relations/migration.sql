-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Note_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("createdAt", "id", "order", "parentId", "title") SELECT "createdAt", "id", "order", "parentId", "title" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE INDEX "Note_parentId_idx" ON "Note"("parentId");
CREATE TABLE "new_NoteBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "categoryId" TEXT,
    "exampleId" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE "new_NoteCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "NoteCategory_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NoteCategory" ("id", "name", "noteId", "order") SELECT "id", "name", "noteId", "order" FROM "NoteCategory";
DROP TABLE "NoteCategory";
ALTER TABLE "new_NoteCategory" RENAME TO "NoteCategory";
CREATE INDEX "NoteCategory_noteId_idx" ON "NoteCategory"("noteId");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteExample_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteExample_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NoteCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NoteExample" ("caption", "categoryId", "createdAt", "hideText", "id", "imagesPerRow", "noteId", "order", "tags", "title") SELECT "caption", "categoryId", "createdAt", "hideText", "id", "imagesPerRow", "noteId", "order", "tags", "title" FROM "NoteExample";
DROP TABLE "NoteExample";
ALTER TABLE "new_NoteExample" RENAME TO "NoteExample";
CREATE INDEX "NoteExample_noteId_idx" ON "NoteExample"("noteId");
CREATE INDEX "NoteExample_categoryId_idx" ON "NoteExample"("categoryId");
CREATE TABLE "new_NoteExampleImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exampleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "tradeId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "NoteExampleImage_exampleId_fkey" FOREIGN KEY ("exampleId") REFERENCES "NoteExample" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteExampleImage_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NoteExampleImage" ("caption", "exampleId", "id", "order", "tradeId", "url") SELECT "caption", "exampleId", "id", "order", "tradeId", "url" FROM "NoteExampleImage";
DROP TABLE "NoteExampleImage";
ALTER TABLE "new_NoteExampleImage" RENAME TO "NoteExampleImage";
CREATE INDEX "NoteExampleImage_exampleId_idx" ON "NoteExampleImage"("exampleId");
CREATE INDEX "NoteExampleImage_tradeId_idx" ON "NoteExampleImage"("tradeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
