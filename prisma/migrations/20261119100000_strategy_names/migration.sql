-- The two strategies renamed (2026-11-19): the yearly levels "Level Bounce", the trend's broken zone "Trend Retest". The trades and the saved filters follow.
UPDATE "Trade" SET "strategy" = 'Level Bounce' WHERE "strategy" = 'Support / Resistance Yearly';
UPDATE "Trade" SET "strategy" = 'Trend Retest' WHERE "strategy" = 'Trade with Trend';
UPDATE "SharedView" SET "filters" = REPLACE("filters", '"Support / Resistance Yearly"', '"Level Bounce"');
UPDATE "SharedView" SET "filters" = REPLACE("filters", '"Trade with Trend"', '"Trend Retest"');
