-- CreateTable
CREATE TABLE "TagOption" (
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("kind", "value")
);
