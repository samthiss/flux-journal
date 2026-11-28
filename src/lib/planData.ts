import { prisma } from "@/lib/prisma";
import type { SymbolResult } from "@/lib/databento/engine";
import { CONTRACTS } from "@/lib/contracts";
import { HOURS_WHY } from "@/lib/pairHoursWhy";
import type { PairPlan } from "@/lib/tradingPlan";

/**
 * Each pair the plan trades, from its backtest: the setting chosen for it,
 * its levels, and its order hours.
 */
export async function loadPairPlans(ownerId: string): Promise<PairPlan[]> {
  const rows = await prisma.databentoSymbol.findMany({ where: { ownerId }, orderBy: { symbol: "asc" } });
  const pairs: PairPlan[] = [];
  for (const row of rows) {
    let r: SymbolResult;
    try {
      r = JSON.parse(row.result ?? "") as SymbolResult;
    } catch {
      continue;
    }
    const c = r.top.find((x) => x.key === row.chosenKey) ?? r.top[0];
    if (!c) continue;
    pairs.push({
      symbol: r.symbol,
      // Without the levels switched off in the backtest page.
      levels: [...r.zones].filter((z) => !offZones(row.disabledZones).some((d) => Math.abs(d - z) < 1e-9)).sort((a, b) => b - a),
      tick: r.tickSize ?? CONTRACTS[r.symbol]?.tickSize ?? 0,
      tickValue: r.tickValue ?? CONTRACTS[r.symbol]?.tickValue ?? 0,
      lots: r.settings.lots,
      offset: c.cfg.offset,
      sl: c.cfg.sl,
      tp1: c.cfg.tp1,
      tp2: c.cfg.kind === "tp1trail" && c.cfg.tp2 > c.cfg.tp1 ? c.cfg.tp2 : null,
      hours: r.rules?.hours ?? [2, 14],
      exclude: r.rules?.excludeHours ?? [],
      why: HOURS_WHY[r.symbol],
    });
  }
  return pairs;
}

/** Which reminders are on. */
export async function pushPrefs() {
  return (await prisma.pushPrefs.findUnique({ where: { id: 1 } })) ?? { id: 1, exit: true, news: true, pull: true, bot: true, approche: true };
}

/** The levels switched off, from their JSON column. */
function offZones(raw: string | null | undefined): number[] {
  try {
    return JSON.parse(raw ?? "[]") as number[];
  } catch {
    return [];
  }
}
