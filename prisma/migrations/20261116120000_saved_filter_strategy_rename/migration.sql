-- The saved trade filters follow the strategy's new name.
UPDATE "SharedView" SET "filters" = REPLACE("filters", '"Jahreswiderstand"', '"Support / Resistance Yearly"');
