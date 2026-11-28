-- Ce que le bot Telegram a reçu de chaque ordre du jour.
ALTER TABLE "PlanOrder" ADD COLUMN "botSentAt" DATETIME;
ALTER TABLE "PlanOrder" ADD COLUMN "botError" TEXT;
ALTER TABLE "PlanOrder" ADD COLUMN "botCancelAt" DATETIME;
