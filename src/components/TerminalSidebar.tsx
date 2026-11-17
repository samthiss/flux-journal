"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { accentColor, lossColor, winColor } from "@/lib/theme";
import { signOut } from "@/app/login/actions";

const ORANGE = accentColor;
const DIM = "#8A8A8A";

/** What the menu shows of the day: the next blocking release and the account. */
export type SidebarStatus = {
  nextNews: { at: string; title: string; currency: string } | null;
  activeOrders: number;
  dayPnl: number;
  positions: number;
  contracts: number;
  /** Order hours, Chicago, [from, to). */
  hours: [number, number];
};

const ITEMS = [
  { href: "/trading-plan", label: "TRADING PLAN", icon: "◉", key: "F1", group: "AUJOURD'HUI", owner: true, match: (p: string) => p.startsWith("/trading-plan") || p.startsWith("/checklist") },
  { href: "/", label: "DASHBOARD", icon: "▦", key: "F2", group: "ANALYSE", owner: false, match: (p: string) => p === "/" },
  { href: "/trades", label: "TRADES", icon: "≡", key: "F3", group: "ANALYSE", owner: false, match: (p: string) => p.startsWith("/trades") || p.startsWith("/trade/") },
  { href: "/backtesting-databento", label: "BACKTESTING", icon: "↗", key: "F4", group: "ANALYSE", owner: true, match: (p: string) => p.startsWith("/backtesting") },
];

const clock = (t: number, timeZone: string) => new Date(t).toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" });
const ctHour = (t: number) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t).split(":").map(Number);
  return h + m / 60;
};
const money = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v)).toLocaleString("fr-FR")} $`;

// Kept in the browser, as the Trading Plan keeps them.
const LS_EVENT = "trading-plan-store";
const lsSubscribe = (cb: () => void) => {
  window.addEventListener(LS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const useLocal = (key: string) =>
  useSyncExternalStore(
    lsSubscribe,
    () => window.localStorage.getItem(key),
    () => null
  );

/** The prop firm's end-of-day drawdown, what "DD restant" is measured against. */
const DD_LIMIT = 2000;
const DAY_LIMIT = 500;

/**
 * The menu, in the terminal's style: what the day needs first (the Trading
 * Plan), then the analysis pages, the next release that blocks orders, and
 * the account's state at the bottom. Folds to a bar of icons; on a phone it
 * is the tab bar at the bottom of the screen.
 */
export default function TerminalSidebar({ owner, status }: { owner: boolean; status: SidebarStatus | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const folded = useLocal("sidebar-folded") === "1";
  const ddRaw = useLocal("trading-plan-dd");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 20000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const items = ITEMS.filter((i) => owner || !i.owner);

  // F1–F4, as on the terminal: not while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const it = items.find((i) => i.key === e.key);
      if (!it) return;
      e.preventDefault();
      router.push(it.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, router]);

  if (pathname === "/login" || pathname === "/inscription") return null;

  const setFolded = (v: boolean) => {
    window.localStorage.setItem("sidebar-folded", v ? "1" : "0");
    window.dispatchEvent(new Event(LS_EVENT));
  };
  const open = !folded;

  const news = status?.nextNews && now !== null ? { ...status.nextNews, t: new Date(status.nextNews.at).getTime() } : null;
  const minsTo = news && now !== null ? Math.round((news.t - now) / 60000) : null;
  const dd = ddRaw ? Number(ddRaw) : null;
  const h = now !== null ? ctHour(now) : null;
  const windowOpen = status && h !== null ? h >= status.hours[0] && h < status.hours[1] : false;

  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <nav aria-label="Navigation principale" className={`tsb ${open ? "" : "tsb-folded"}`}>
      {/* ---- Brand ---- */}
      <div className="tsb-brand" style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 14px 14px", borderBottom: "1px solid #1F1F1F" }}>
        {open && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.12em", color: "#FFF" }}>
              FLUX <span style={{ color: DIM, fontWeight: 500, letterSpacing: "0.06em" }}>JOURNAL</span>
            </div>
            <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>
              {now !== null
                ? `${new Date(now).toLocaleDateString("fr-FR", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit" }).toUpperCase().replace(".", "")} · CT ${clock(now, "America/Chicago")} · BER ${clock(now, "Europe/Berlin")}`
                : " "}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setFolded(open)}
          aria-label={open ? "Replier le menu" : "Déplier le menu"}
          style={{ cursor: "pointer", border: "1px solid #2E2E2E", background: "transparent", color: DIM, width: 22, height: 22, fontSize: 11, flexShrink: 0, fontFamily: "inherit", padding: 0 }}
        >
          {open ? "«" : "»"}
        </button>
      </div>

      {/* ---- Next blocking release ---- */}
      {open && owner && news && minsTo !== null && minsTo > -10 && (
        <Link href="/trading-plan" className="tsb-news" style={{ display: "block", margin: "12px 12px 4px", padding: "8px 10px", border: "1px solid #3A2A0E", background: "#140F05", textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: ORANGE, fontWeight: 700 }}>
            <span className="news-alert-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: lossColor }} />
            PROCHAINE NEWS 3★
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 3 }}>
            <span style={{ color: "#FFF", fontWeight: 700, lineHeight: 1.3 }}>
              {news.currency} {news.title}
            </span>
            <span style={{ color: lossColor, fontWeight: 700, whiteSpace: "nowrap" }}>
              {minsTo <= 0 ? "maintenant" : minsTo < 60 ? `dans ${minsTo} min` : `${clock(news.t, "Europe/Berlin")} BER`}
            </span>
          </div>
          <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
            Aucun ordre {clock(news.t - 600000, "America/Chicago")}–{clock(news.t + 600000, "America/Chicago")} CT
          </div>
        </Link>
      )}

      {/* ---- Pages ---- */}
      <div className="tsb-items">
        {groups.map((g) => (
          <div key={g} className="tsb-group" style={{ padding: "10px 0 2px" }}>
            {open && (
              <div className="tsb-group-title" style={{ padding: "4px 16px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#5E5E5E" }}>
                {g}
              </div>
            )}
            {items
              .filter((i) => i.group === g)
              .map((it) => {
                const on = it.match(pathname);
                const badge = it.href === "/trading-plan" && status && status.activeOrders > 0 ? `${status.activeOrders} ordre${status.activeOrders > 1 ? "s" : ""}` : null;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    title={it.label}
                    className="tsb-item"
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: open ? "9px 14px 9px 13px" : "11px 0",
                      justifyContent: open ? "flex-start" : "center",
                      fontSize: 12.5,
                      fontWeight: on ? 700 : 500,
                      letterSpacing: "0.04em",
                      color: on ? ORANGE : "#B5B5B5",
                      background: on ? "#1F1608" : "transparent",
                      boxShadow: on ? `inset 3px 0 0 ${ORANGE}` : "none",
                      textDecoration: "none",
                    }}
                  >
                    <span aria-hidden="true" className="tsb-icon" style={{ width: 18, textAlign: "center", fontSize: 14, color: on ? ORANGE : "#6E6E6E" }}>
                      {it.icon}
                    </span>
                    <span className="tsb-label" style={{ flex: 1, textAlign: "left" }}>
                      {it.label}
                    </span>
                    {open && (
                      <>
                        {badge && (
                          <span className="tsb-badge" style={{ fontSize: 10, fontWeight: 700, padding: "0 5px", background: ORANGE, color: "#000" }}>
                            {badge}
                          </span>
                        )}
                        <span className="tsb-key" style={{ fontSize: 10, color: "#555", width: 22, textAlign: "right" }}>
                          {it.key}
                        </span>
                      </>
                    )}
                    {!open && badge && <span style={{ position: "absolute", top: 6, right: 8, width: 7, height: 7, borderRadius: "50%", background: ORANGE }} />}
                  </Link>
                );
              })}
          </div>
        ))}
      </div>

      {/* ---- Account ---- */}
      <div className="tsb-foot" style={{ marginTop: "auto", borderTop: "1px solid #1F1F1F" }}>
        {owner && status && open && (
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <Gauge
              label="DD RESTANT"
              value={dd !== null ? `${dd.toLocaleString("fr-FR")} / ${DD_LIMIT.toLocaleString("fr-FR")} $` : "À SAISIR"}
              color={winColor}
              pct={dd !== null ? (dd / DD_LIMIT) * 100 : 0}
              href="/trading-plan"
            />
            <Gauge
              label="P&L DU JOUR"
              value={
                <>
                  {money(status.dayPnl)} <span style={{ color: "#555" }}>/ −{DAY_LIMIT}</span>
                </>
              }
              color={status.dayPnl < 0 ? lossColor : "#E6E6E6"}
              barColor={lossColor}
              pct={status.dayPnl < 0 ? (-status.dayPnl / DAY_LIMIT) * 100 : 0}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: DIM }}>
              <span>
                POSITIONS <span style={{ color: "#FFF" }}>{status.positions} / 2</span>
              </span>
              <span>
                CONTRATS <span style={{ color: "#FFF" }}>{status.contracts} / 5</span>
              </span>
            </div>
          </div>
        )}
        {owner && status && open && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderTop: "1px solid #1F1F1F", fontSize: 10, color: DIM }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: windowOpen ? winColor : "#555" }} />
              {windowOpen ? `FENÊTRE OUVERTE · FIN ${String(status.hours[1]).padStart(2, "0")}:00 CT` : `FENÊTRE FERMÉE · ${String(status.hours[0]).padStart(2, "0")}:00–${String(status.hours[1]).padStart(2, "0")}:00 CT`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px 10px", fontSize: 10, color: DIM }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#555" }} />
              DATABENTO : PAS CONNECTÉ
            </div>
          </>
        )}
        {owner && status && !open && (
          <div title={dd !== null ? `DD restant ${dd} / ${DD_LIMIT} $` : "DD restant à saisir"} style={{ padding: "12px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: ORANGE, fontWeight: 700 }}>DD</span>
            <div style={{ width: 6, height: 60, background: "#1A1A1A", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div style={{ height: `${dd !== null ? Math.min(100, (dd / DD_LIMIT) * 100) : 0}%`, background: winColor }} />
            </div>
          </div>
        )}
        <form action={signOut} style={{ borderTop: "1px solid #1F1F1F" }}>
          <button
            type="submit"
            title="Se déconnecter"
            style={{ cursor: "pointer", width: "100%", border: 0, background: "transparent", color: "#6E6E6E", fontFamily: "inherit", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", padding: "10px 14px", textAlign: open ? "left" : "center" }}
          >
            {open ? "⏻ SE DÉCONNECTER" : "⏻"}
          </button>
        </form>
      </div>
    </nav>
  );
}

function Gauge({ label, value, color, pct, barColor, href }: { label: string; value: React.ReactNode; color: string; pct: number; barColor?: string; href?: string }) {
  const body = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700 }}>
        <span style={{ color: ORANGE }}>{label}</span>
        <span style={{ color }}>{value}</span>
      </div>
      <div style={{ height: 5, background: "#1A1A1A", marginTop: 4 }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor ?? color }} />
      </div>
    </>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: "none" }}>
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}
