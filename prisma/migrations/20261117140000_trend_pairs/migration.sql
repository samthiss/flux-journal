-- "Trade with Trend" per pair: on for 6J and ZN to start with, the others in the report but left out of the figures.
ALTER TABLE "DatabentoSymbol" ADD COLUMN "trendOn" BOOLEAN NOT NULL DEFAULT false;
UPDATE "DatabentoSymbol" SET "trendOn" = true WHERE "symbol" IN ('6J', 'ZN');
