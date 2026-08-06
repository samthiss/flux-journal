-- AlterTable
ALTER TABLE "NoteExample" ADD COLUMN "categoryId" TEXT;

-- CreateTable
CREATE TABLE "NoteCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);
