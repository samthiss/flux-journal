-- The strategy renamed: trades already filed under it follow.
UPDATE "Trade" SET "strategy" = 'Support / Resistance Yearly' WHERE "strategy" = 'Jahreswiderstand';
