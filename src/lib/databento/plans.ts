import { prisma } from "@/lib/prisma";
import { CONTRACTS } from "@/lib/contracts";
import type { SymbolResult } from "@/lib/databento/engine";

/** What a yearly-levels trade is planned from: the symbol's levels and its backtested setting, in ticks. */
export type LevelPlan = {
  levels: number[];
  tickSize: number;
  /** Ticks before the level the order sits; negative beyond it (ZS). */
  offset: number;
  sl: number;
  tp1: number;
  tp2: number | null;
};

/** Each symbol's plan, as the Databento report reads it: the chosen setting, or the first. */
export async function levelPlans(ownerId: string): Promise<Record<string, LevelPlan>> {
  const rows = await prisma.databentoSymbol.findMany({ where: { ownerId } });
  const out: Record<string, LevelPlan> = {};
  for (const row of rows) {
    let r: SymbolResult;
    try {
      r = JSON.parse(row.result ?? "") as SymbolResult;
    } catch {
      continue;
    }
    const c = r.top.find((x) => x.key === row.chosenKey) ?? r.top[0];
    const tickSize = r.tickSize ?? CONTRACTS[r.symbol]?.tickSize;
    if (!c || !tickSize) continue;
    out[r.symbol] = {
      levels: [...r.zones].sort((a, b) => b - a),
      tickSize,
      offset: c.cfg.offset,
      sl: c.cfg.sl,
      tp1: c.cfg.tp1,
      tp2: c.cfg.kind === "tp1trail" && c.cfg.tp2 > c.cfg.tp1 ? c.cfg.tp2 : null,
    };
  }
  return out;
}
