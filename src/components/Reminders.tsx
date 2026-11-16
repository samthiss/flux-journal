"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { accentColor, glassCard, lossColor, winColor } from "@/lib/theme";
import { exitAt } from "@/lib/exitTime";
import { addPushDevice, closePosition, openPosition, pushPublicKey, removePushDevice, sendTestPush } from "@/lib/actions/reminders";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;
const DIM = "oklch(0.55 0 0)";

const clock = (t: number, timeZone: string) => new Date(t).toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" });

/** Today at a Berlin wall-clock time, as an instant; a time later than now is taken as yesterday's. */
function berlinToday(hhmm: string, now: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
  const [y, mo, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const shown = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(guess);
  const [sh, sm] = shown.split(":").map(Number);
  let t = guess - ((sh * 60 + sm - (h * 60 + m) + 1440) % 1440) * 60000;
  if (t > now + 60000) t -= 86400000;
  return t;
}

function toKey(base64: string) {
  const s = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

type Support = "server" | "none" | "ios-browser" | "ok";
const noop = () => () => {};
function support(): Support {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    return ios && !standalone ? "ios-browser" : "none";
  }
  return "ok";
}

const Btn = ({ children, onClick, tone = accentColor, disabled }: { children: React.ReactNode; onClick: () => void; tone?: string; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{ ...mono, fontSize: 11, fontWeight: 700, padding: "5px 12px", background: "none", border: `1px solid ${tone}`, color: tone, cursor: "pointer", opacity: disabled ? 0.5 : 1 }}
  >
    {children}
  </button>
);

/**
 * The reminders on the phone: switched on for this device, and the trade just
 * filled, from which the four hours are counted.
 */
export default function Reminders({ pairs, open, now }: { pairs: string[]; open: { id: string; symbol: string; filledAt: string }[]; now: number }) {
  const sup = useSyncExternalStore(noop, support, () => "server" as Support);
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const [pair, setPair] = useState(pairs[0] ?? "");
  const [time, setTime] = useState("");

  useEffect(() => {
    if (sup !== "ok") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setSub(s))
      .catch(() => setSub(null));
  }, [sup]);

  const enable = () =>
    start(async () => {
      try {
        if ((await Notification.requestPermission()) !== "granted") return setMsg("Notifications refusées : autorise-les dans les réglages du téléphone.");
        const reg = await navigator.serviceWorker.ready;
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(await pushPublicKey()) });
        await addPushDevice(JSON.parse(JSON.stringify(s)));
        setSub(s);
        const n = await sendTestPush();
        setMsg(`Activé. Notification de test envoyée (${n} appareil${n > 1 ? "s" : ""}).`);
      } catch (e) {
        setMsg(`Échec : ${(e as Error).message}`);
      }
    });
  const disable = () =>
    start(async () => {
      if (sub) {
        await removePushDevice(sub.endpoint);
        await sub.unsubscribe();
      }
      setSub(null);
      setMsg("Désactivé sur cet appareil.");
    });
  const test = () =>
    start(async () => {
      const n = await sendTestPush();
      setMsg(`Test envoyé à ${n} appareil${n > 1 ? "s" : ""}.`);
    });
  const filled = () =>
    start(async () => {
      const t = time ? berlinToday(time, Date.now()) : Date.now();
      await openPosition(pair, new Date(t).toISOString());
      setTime("");
    });

  const input = { ...mono, fontSize: 12, background: "#000", color: "oklch(0.9 0 0)", border: "1px solid #2E2E2E", padding: "4px 8px" } as const;

  return (
    <div style={{ ...glassCard, marginTop: 24, padding: "14px 18px", ...mono }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, background: accentColor, display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.92 0 0)" }}>Rappels sur ton téléphone</span>
      </div>
      <div style={{ fontSize: 11, color: DIM, marginBottom: 10, lineHeight: 1.6 }}>
        News 3 étoiles de tes paires : 15 min avant. Trade rempli : 15 min avant la sortie, puis à la sortie (4 h après le remplissage, au plus tard 16h CT).
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 11.5 }}>
        {sup === "server" && <span style={{ color: DIM }}>…</span>}
        {sup === "ios-browser" && (
          <span style={{ color: "oklch(0.85 0 0)", lineHeight: 1.6 }}>
            Sur iPhone : touche <b>Partager</b> puis <b>Sur l&apos;écran d&apos;accueil</b>, ouvre le journal depuis l&apos;icône, et reviens ici activer les
            rappels.
          </span>
        )}
        {sup === "none" && <span style={{ color: lossColor }}>Ce navigateur ne reçoit pas de notifications.</span>}
        {sup === "ok" && sub === null && (
          <Btn onClick={enable} disabled={pending}>
            ACTIVER SUR CET APPAREIL
          </Btn>
        )}
        {sup === "ok" && sub && (
          <>
            <span style={{ color: winColor }}>● ACTIVÉ SUR CET APPAREIL</span>
            <Btn onClick={test} disabled={pending}>
              TESTER
            </Btn>
            <Btn onClick={disable} disabled={pending} tone={DIM}>
              DÉSACTIVER
            </Btn>
          </>
        )}
        {msg && <span style={{ color: DIM }}>{msg}</span>}
      </div>

      <div style={{ marginTop: 16, borderTop: "1px solid #2E2E2E", paddingTop: 10 }}>
        <div style={{ fontSize: 10.5, color: DIM, letterSpacing: "0.12em", marginBottom: 8 }}>TRADE REMPLI</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 11.5 }}>
          <select value={pair} onChange={(e) => setPair(e.target.value)} style={input}>
            {pairs.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <span style={{ color: DIM }}>rempli à</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={input} />
          <span style={{ color: DIM }}>Berlin (vide = maintenant)</span>
          <Btn onClick={filled} disabled={pending || !pair}>
            REMPLI
          </Btn>
        </div>
        {open.map((p) => {
          const f = new Date(p.filledAt).getTime();
          const end = exitAt(f);
          const left = Math.round((end - now) / 60000);
          return (
            <div key={p.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, padding: "8px 0", borderBottom: "1px solid oklch(0.26 0 0 / 0.5)", fontSize: 11.5 }}>
              <span style={{ fontWeight: 700, color: "oklch(0.92 0 0)", width: 34 }}>{p.symbol}</span>
              <span style={{ color: DIM }}>
                rempli {clock(f, "Europe/Berlin")} Berlin · {clock(f, "America/Chicago")} CT
              </span>
              <span style={{ color: left <= 15 ? lossColor : accentColor, fontWeight: 700 }}>
                SORTIE {clock(end, "Europe/Berlin")} BERLIN · {clock(end, "America/Chicago")} CT
                {left > 0 ? ` (dans ${Math.floor(left / 60)} h ${String(left % 60).padStart(2, "0")})` : " — À FERMER"}
              </span>
              <Btn onClick={() => start(() => closePosition(p.id))} disabled={pending} tone={DIM}>
                FERMÉ
              </Btn>
            </div>
          );
        })}
      </div>
    </div>
  );
}
