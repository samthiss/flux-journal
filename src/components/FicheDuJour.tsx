"use client";

import { useEffect, useState } from "react";
import { glassCard, lossColor, accentColor } from "@/lib/theme";
import { fieldStyle, label, mono, td, th } from "@/components/BacktestUi";
import { fmtPrice, fmtZone, parsePrice } from "@/lib/databento/format";
import { chicagoInstant } from "@/lib/databento/clock";

export type FichePair = {
  symbol: string;
  levels: number[];
  tickSize: number;
  tickValue: number;
  lots: number;
  /** Ticks before (+) or beyond (−) the level the order sits. */
  offset: number;
  sl: number;
  tp1: number;
  trail: number;
  /** Ticks price must move away from a level before a return to it is a new touch. */
  rearm: number;
  hours: [number, number] | null;
  excludeHours: number[];
  minApproach: number | null;
  blackout: { before: number; after: number; all?: boolean } | null;
  currencies: string[];
};

type News = { at: number; currency: string; title: string };

/** The trader's own daily limit, as set in the account rules. */
const DAILY_STOP = 500;
const FLAT_AT = 16;

const hm = (t: number, timeZone?: string) =>
  new Intl.DateTimeFormat("fr-CH", { timeZone, hour: "2-digit", minute: "2-digit" }).format(t);

/** Consecutive hours as spans: [8, 9, 10] → "8h–11h". */
function spans(hours: number[]) {
  const out: [number, number][] = [];
  for (const h of [...hours].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && last[1] === h) last[1] = h + 1;
    else out.push([h, h + 1]);
  }
  return out;
}

export default function FicheDuJour({
  session,
  pairs,
  news,
  newsFailed,
  maxHours,
}: {
  session: { y: number; m: number; d: number };
  pairs: FichePair[];
  news: News[] | null;
  newsFailed: boolean;
  maxHours: number;
}) {
  const key = `fiche-ouverture-${session.y}-${session.m}-${session.d}`;
  const [opens, setOpens] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own storage, read once after mount
      setOpens(saved);
    } catch {
      // ignore storage failures
    }
  }, [key]);
  const setOpen = (symbol: string, text: string) => {
    const next = { ...opens, [symbol]: text };
    setOpens(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  };

  const at = (h: number, min = 0) => chicagoInstant(session.y, session.m, session.d, h, min);
  const both = (t: number) => `${hm(t, "America/Chicago")} Chicago · ${hm(t)} chez toi`;
  const dayText = new Intl.DateTimeFormat("fr-CH", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(
    Date.UTC(session.y, session.m - 1, session.d)
  );
  const firstHour = Math.min(...pairs.map((p) => p.hours?.[0] ?? 2));
  const blackout = pairs.find((p) => p.blackout)?.blackout ?? null;
  const minApproach = pairs.find((p) => p.minApproach)?.minApproach ?? null;
  const dayNews = (news ?? []).slice().sort((a, b) => a.at - b.at);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={glassCard}>
        <div style={{ ...label }}>Séance du {dayText}</div>
        <ol style={{ margin: "12px 0 0", paddingLeft: 20, lineHeight: 1.7, fontSize: 13.5 }}>
          <li>
            Avant {firstHour}h Chicago ({hm(at(firstHour))} chez toi) : entre pour chaque paire le prix d&apos;ouverture de 17h
            (hier soir). La fiche te dit quels ordres poser.
          </li>
          {minApproach && (
            <li>
              Un niveau à moins de {minApproach} ticks du prix de 17h ne se trade pas. Un niveau que le prix a déjà traversé depuis
              17h non plus : n&apos;y laisse pas d&apos;ordre.
            </li>
          )}
          <li>
            Une touche avant l&apos;heure ou annulée pour une news ne brûle pas le niveau : si le prix s&apos;en éloigne jusqu&apos;au
            prix « réarmé » puis y revient dans les heures, c&apos;est un nouveau trade.
          </li>
          <li>
            Un seul trade par paire et par jour : tu poses un ordre par niveau valable, et dès que l&apos;un d&apos;eux est rempli, tu
            annules les autres ordres de cette paire. Une fois la position fermée (TP1, stop ou trailing), plus de trade sur cette paire
            jusqu&apos;au lendemain. Les autres paires gardent leurs ordres.
          </li>
          <li>Deux positions au plus en même temps (5 contrats) : avec deux positions ouvertes, ne prends pas la troisième.</li>
          <li>
            Chaque ordre part avec son SL. À TP1, un lot sort et le stop passe au prix d&apos;entrée ; l&apos;autre lot suit en
            trailing.
          </li>
          <li>
            {maxHours} h au plus en position, et tout est fermé à {FLAT_AT}h Chicago ({hm(at(FLAT_AT))} chez toi).
          </li>
          <li style={{ color: lossColor }}>−{DAILY_STOP} $ dans la journée, positions ouvertes comprises : tu fermes tout, la journée est finie.</li>
        </ol>
      </div>

      <div style={glassCard}>
        <div style={label}>News 3 étoiles du jour</div>
        {newsFailed ? (
          <div style={{ marginTop: 10, fontSize: 13, color: lossColor }}>Le calendrier n&apos;a pas pu être lu : vérifie les news à la main.</div>
        ) : dayNews.length === 0 ? (
          <div style={{ marginTop: 10, fontSize: 13 }}>Aucune news 3 étoiles pour tes paires.</div>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={th}>Heure</th>
                <th style={th}>News</th>
                <th style={th}>Paires</th>
                <th style={th}>Pas d&apos;ordre</th>
              </tr>
            </thead>
            <tbody>
              {dayNews.map((n) => (
                <tr key={`${n.at}-${n.currency}-${n.title}`}>
                  <td style={td}>{both(n.at)}</td>
                  <td style={{ ...td, fontFamily: "inherit", whiteSpace: "normal" }}>
                    {n.currency} · {n.title}
                  </td>
                  <td style={td}>
                    {pairs
                      .filter((p) => p.currencies.includes(n.currency))
                      .map((p) => p.symbol)
                      .join(" ")}
                  </td>
                  <td style={td}>
                    {blackout
                      ? `${hm(n.at - blackout.before * 60000, "America/Chicago")}–${hm(n.at + blackout.after * 60000, "America/Chicago")} Chicago`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pairs.map((p) => {
        const open = parsePrice(opens[p.symbol] ?? "");
        const money = p.tickValue * p.lots;
        const pairNews = dayNews.filter((n) => p.currencies.includes(n.currency));
        // Hours kept out at the window's edges narrow it; the others are shown as gaps.
        let win = p.hours;
        if (win) {
          let [a, b] = win;
          while (b > a && p.excludeHours.includes(b - 1)) b--;
          while (a < b && p.excludeHours.includes(a)) a++;
          win = [a, b];
        }
        const out = spans(p.excludeHours.filter((h) => win && h >= win[0] && h < win[1]));
        return (
          <div key={p.symbol} style={glassCard}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <div style={{ ...label, fontSize: 14, color: accentColor }}>{p.symbol}</div>
              {win && (
                <div style={{ fontSize: 12.5 }}>
                  ordres de {win[0]}h à {win[1]}h Chicago ({hm(at(win[0]))}–{hm(at(win[1]))} chez toi)
                  {out.length > 0 && <> · pas d&apos;ordre {out.map(([a, b]) => `${a}h–${b}h`).join(", ")}</>}
                </div>
              )}
              <div style={{ fontSize: 12.5 }}>
                {p.lots} lots · SL {p.sl} ticks ({(p.sl * money).toFixed(0)} $) · TP1 {p.tp1} · trailing {p.trail}
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, fontSize: 13 }}>
              Ouverture 17h
              <input
                value={opens[p.symbol] ?? ""}
                onChange={(e) => setOpen(p.symbol, e.target.value)}
                placeholder={fmtZone(p.levels[Math.floor(p.levels.length / 2)], p.symbol)}
                inputMode="decimal"
                style={{ ...fieldStyle, ...mono, width: 130 }}
              />
              {opens[p.symbol] && open === null && <span style={{ color: lossColor }}>prix illisible</span>}
            </label>

            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={th}>Niveau</th>
                    <th style={th}>Ordre</th>
                    <th style={th}>Entrée (limite)</th>
                    <th style={th}>SL</th>
                    <th style={th}>TP1 (1 lot)</th>
                    <th style={th}>Distance</th>
                    <th style={th}>Réarmé à</th>
                  </tr>
                </thead>
                <tbody>
                  {p.levels.map((z) => {
                    if (open === null)
                      return (
                        <tr key={z}>
                          <td style={td}>{fmtZone(z, p.symbol)}</td>
                          <td style={{ ...td, fontFamily: "inherit", color: "oklch(0.6 0.03 250)" }} colSpan={5}>
                            entre le prix de 17h
                          </td>
                          <td style={td}>
                            {fmtPrice(z + p.rearm * p.tickSize, p.symbol, p.tickSize)} / {fmtPrice(z - p.rearm * p.tickSize, p.symbol, p.tickSize)}
                          </td>
                        </tr>
                      );
                    const dir = z < open ? 1 : -1;
                    const dist = Math.abs(open - z) / p.tickSize;
                    const ok = minApproach === null || dist >= (p.minApproach ?? minApproach) - 1e-6;
                    const entry = z + dir * p.offset * p.tickSize;
                    const price = (x: number) => fmtPrice(x, p.symbol, p.tickSize);
                    return (
                      <tr key={z} style={{ opacity: ok ? 1 : 0.45 }}>
                        <td style={td}>{fmtZone(z, p.symbol)}</td>
                        <td style={{ ...td, fontFamily: "inherit", fontWeight: 700, color: ok ? (dir === 1 ? "oklch(0.78 0.16 150)" : lossColor) : undefined }}>
                          {ok ? (dir === 1 ? "Achat" : "Vente") : "Pas d'ordre"}
                        </td>
                        <td style={td}>{ok ? price(entry) : "—"}</td>
                        <td style={td}>{ok ? price(entry - dir * p.sl * p.tickSize) : "—"}</td>
                        <td style={td}>{ok ? price(entry + dir * p.tp1 * p.tickSize) : "—"}</td>
                        <td style={{ ...td, fontFamily: "inherit" }}>
                          {dist.toFixed(0)} ticks de 17h{ok ? "" : ` (moins de ${p.minApproach ?? minApproach})`}
                        </td>
                        <td style={td}>{ok ? price(z + dir * p.rearm * p.tickSize) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pairNews.length > 0 && p.blackout && (
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                News : annule les ordres{" "}
                {pairNews
                  .map((n) => `${hm(n.at - p.blackout!.before * 60000, "America/Chicago")}–${hm(n.at + p.blackout!.after * 60000, "America/Chicago")}`)
                  .join(", ")}{" "}
                Chicago, et repose-les après.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
