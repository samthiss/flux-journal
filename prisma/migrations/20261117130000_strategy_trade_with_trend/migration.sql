-- "Support / Resistance last days" renamed "Trade with Trend": the trades and the saved filters follow.
UPDATE "Trade" SET "strategy" = 'Trade with Trend' WHERE "strategy" = 'Support / Resistance last days';
UPDATE "SharedView" SET "filters" = REPLACE("filters", '"Support / Resistance last days"', '"Trade with Trend"');
