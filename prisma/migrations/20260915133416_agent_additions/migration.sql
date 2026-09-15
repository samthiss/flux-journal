-- CreateTable
CREATE TABLE "AgentAddition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "note" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "ligne" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AgentAddition_note_idx" ON "AgentAddition"("note");
