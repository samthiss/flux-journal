-- La notification envoyée quand le bot confirme un ordre.
ALTER TABLE "PushPrefs" ADD COLUMN "bot" BOOLEAN NOT NULL DEFAULT true;
