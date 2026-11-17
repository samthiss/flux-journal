-- Levels switched off by the trader: out of the Trading Plan, the journal form and the backtest figures.
ALTER TABLE "DatabentoSymbol" ADD COLUMN "disabledZones" TEXT NOT NULL DEFAULT '[]';
