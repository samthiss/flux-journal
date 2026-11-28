-- La pose automatique de l'ordre quand le prix approche d'une ligne. Éteinte par défaut.
ALTER TABLE "PushPrefs" ADD COLUMN "autoPose" BOOLEAN NOT NULL DEFAULT false;
