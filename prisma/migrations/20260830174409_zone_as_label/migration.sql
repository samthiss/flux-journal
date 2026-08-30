-- The zone stops being one of two keys and becomes the word itself, so new
-- zones can be written the way trade types and confirmations already are.
-- The two keys in use are rewritten to the labels they were displayed as.
UPDATE "NoteExample" SET "zone" = 'Zone de retournement' WHERE "zone" = 'retournement';
UPDATE "NoteExample" SET "zone" = 'Stunden Cluster' WHERE "zone" = 'stunden';
