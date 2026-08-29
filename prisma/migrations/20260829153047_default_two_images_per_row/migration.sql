-- Two images per row everywhere.
--
-- The column already defaults to 2, so every example created since carries it;
-- these fifteen rows were set to 1 by hand or came in that way from the import.
-- A data migration rather than a boot script: it has to happen exactly once,
-- and `prisma migrate deploy` is the thing that guarantees that.
--
-- The per-example toggle stays: this sets a starting point, it does not take
-- the choice away.
UPDATE "NoteExample" SET "imagesPerRow" = 2 WHERE "imagesPerRow" <> 2;
