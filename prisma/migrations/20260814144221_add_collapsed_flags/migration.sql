-- AlterTable
ALTER TABLE "Note" ADD COLUMN "collapsed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NoteCategory" ADD COLUMN "collapsed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NoteExample" ADD COLUMN "collapsed" BOOLEAN NOT NULL DEFAULT false;
