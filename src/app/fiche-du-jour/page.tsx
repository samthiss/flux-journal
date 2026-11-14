import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import { PageTitle } from "@/components/NeonText";
import FicheDuJour, { type FichePair } from "@/components/FicheDuJour";
import type { SymbolResult } from "@/lib/databento/engine";
import { CONTRACTS, newsCurrencies } from "@/lib/contracts";
import { getHighImpactBetween } from "@/lib/economicCalendar";
import { chicagoInstant, sessionDate } from "@/lib/databento/clock";

export const dynamic = "force-dynamic";

/** The day's orders, from each pair's backtested setting and the day's releases. */
export default async function FicheDuJourPage() {
  const ownerId = await monJournal();
  const rows = await prisma.databentoSymbol.findMany({ where: { ownerId }, orderBy: { symbol: "asc" } });

  const pairs: FichePair[] = [];
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
      levels: [...r.zones].sort((a, b) => b - a),
      tickSize: r.tickSize ?? CONTRACTS[r.symbol]?.tickSize ?? 0,
      tickValue: r.tickValue,
      lots: r.settings.lots,
      offset: c.cfg.offset,
      sl: c.cfg.sl,
      tp1: c.cfg.tp1,
      trail: c.cfg.dist,
      rearm: r.settings.rearm,
      hours: r.rules?.hours ?? null,
      excludeHours: r.rules?.excludeHours ?? [],
      minApproach: r.rules?.minApproach ?? null,
      blackout: r.rules?.blackout ?? null,
      currencies: newsCurrencies(r.symbol),
    });
  }

  const s = sessionDate(Date.now());
  const from = chicagoInstant(s.y, s.m, s.d, 0);
  const to = chicagoInstant(s.y, s.m, s.d, 23, 59);
  const currencies = [...new Set(pairs.flatMap((p) => p.currencies))];
  const news = currencies.length ? await getHighImpactBetween(new Date(from), new Date(to), currencies) : [];
  const maxHours = rows.length ? (JSON.parse(rows[0].result ?? "{}") as SymbolResult).settings?.maxHours ?? 4 : 4;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Fiche du jour</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Les ordres à poser selon le plan backtesté, paire par paire, et les news à éviter
        </div>
      </div>
      <FicheDuJour session={s} pairs={pairs} news={news} newsFailed={news === null} maxHours={maxHours} />
    </div>
  );
}
