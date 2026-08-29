"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { PageTitle } from "@/components/NeonText";
import { removeChartSlot } from "@/lib/actions/trades";
import { CHART_SLOTS } from "@/lib/chartSlots";

const SETUP_OPTIONS = ["Trend run", "Backtest reverse"];
const EMOTIONS = ["Calm", "Cautious", "Nervous", "Impatient", "Frustrated", "Revenge", "Greedy"];

export type TradeFormValues = {
  date: string;
  time: string;
  symbol: string;
  market: string;
  setup: string;
  side: string;
  size: string;
  pnl: string;
  risk: string;
  emotion: string;
  preTradeNotes: string;
  postTradeNotes: string;
};

export type ExistingCharts = Partial<Record<(typeof CHART_SLOTS)[number]["key"], string>>;

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "oklch(0.18 0.034 250)",
  border: "1px solid oklch(0.32 0.051 250 / 0.6)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "oklch(0.96 0.0068 250)",
  fontFamily: "var(--font-space-grotesk), sans-serif",
  fontSize: 13,
  outline: "none",
};

const monoInputStyle: React.CSSProperties = { ...inputStyle, fontFamily: "var(--font-jetbrains-mono), monospace" };

// Exactly what the serving route can hand back with a real Content-Type.
// `image/*` would also offer SVG, which is a document that can carry script.
const ACCEPTED_CHART_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function fieldLabel(text: string) {
  return <div style={{ fontSize: 12, color: "oklch(0.6 0.034 250)", marginBottom: 6 }}>{text}</div>;
}

function ChartSlotInput({
  slotKey,
  label,
  initialSrc,
  tradeId,
}: {
  slotKey: string;
  label: string;
  initialSrc?: string;
  tradeId?: string;
}) {
  const [preview, setPreview] = useState(initialSrc ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File) {
    // The server reads the bytes and refuses anything else, but it refuses by
    // throwing, which costs the whole form. Catching it here keeps an ordinary
    // mistake — an SVG dropped in, which `image/*` happily offers — a line of
    // text instead of an error page.
    if (!ACCEPTED_CHART_TYPES.includes(file.type)) {
      setTypeError(true);
      return;
    }
    setTypeError(false);
    const dt = new DataTransfer();
    dt.items.add(file);
    if (inputRef.current) inputRef.current.files = dt.files;
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function removeExisting() {
    if (!tradeId) return;
    setPreview("");
    startTransition(() => removeChartSlot(tradeId, slotKey));
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) loadFile(file);
      }}
      style={{
        display: "block",
        border: `1.5px dashed ${dragOver ? accentColor : "oklch(0.36 0.051 250 / 0.6)"}`,
        borderRadius: 10,
        padding: 14,
        background: "oklch(0.16 0.0306 250)",
        cursor: "pointer",
        opacity: isPending ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.78 0.034 250)" }}>{label}</div>
      {!preview && <div style={{ fontSize: 11, color: "oklch(0.5 0.034 250)", marginTop: 4 }}>Drag &amp; drop or click</div>}
      {preview && (
        <div style={{ position: "relative", marginTop: 8 }}>
          <div
            style={{
              width: "100%",
              aspectRatio: "16/10",
              borderRadius: 8,
              backgroundImage: `url(${preview})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              border: "1px solid oklch(0.32 0.051 250 / 0.5)",
            }}
          />
          {tradeId && (
            <div
              onClick={(e) => {
                e.preventDefault();
                removeExisting();
              }}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "oklch(0.15 0.034 250 / 0.85)",
                color: "oklch(0.9 0 0)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </div>
          )}
        </div>
      )}
      {typeError && (
        <div style={{ marginTop: 6, fontSize: 11, color: "oklch(0.7 0.25 18)" }}>
          Formats acceptés : PNG, JPEG, WebP, GIF.
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        name={`chart_${slotKey}`}
        accept={ACCEPTED_CHART_TYPES.join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
        }}
      />
    </label>
  );
}

export default function TradeForm({
  action,
  deleteAction,
  tradeId,
  initial,
  existingCharts = {},
  title,
  subtitle,
  riskPerLot,
}: {
  action: (formData: FormData) => void;
  deleteAction?: (formData: FormData) => void;
  tradeId?: string;
  initial: TradeFormValues;
  /** What one lot risked on the last trade that recorded it, if any. */
  riskPerLot?: number | null;
  existingCharts?: ExistingCharts;
  title: string;
  subtitle: string;
}) {
  const [side, setSide] = useState(initial.side);
  const [emotion, setEmotion] = useState(initial.emotion);

  // P&L, size and risk are held here rather than left uncontrolled, because the
  // R:R is computed from them as they are typed.
  const [pnl, setPnl] = useState(initial.pnl);
  const [size, setSize] = useState(initial.size);
  const [risk, setRisk] = useState(initial.risk);

  const num = (v: string) => {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const riskValue = num(risk);
  const pnlValue = num(pnl);
  const computedRR = riskValue && pnlValue != null ? pnlValue / Math.abs(riskValue) : null;

  // The risk scales with the number of lots, so typing a size fills it in from
  // what one lot risked last time. It stays editable — a wider stop on one
  // trade is exactly the case a fixed per-lot figure gets wrong.
  const sizeValue = num(size);
  const perLot = (lots: number) => String(Math.round(riskPerLot! * Math.abs(lots)));
  const suggestedRisk = riskPerLot && sizeValue ? perLot(sizeValue) : null;
  const onSizeChange = (next: string) => {
    setSize(next);
    const lots = num(next);
    if (!riskPerLot || !lots) return;
    // Only fills a field the reader has not written in themselves.
    if (!risk || (sizeValue && risk === perLot(sizeValue))) setRisk(perLot(lots));
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    textAlign: "center",
    padding: 10,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    background: active ? accentColor : "transparent",
    color: active ? "oklch(0.12 0.017 250)" : "oklch(0.7 0.034 250)",
    border: `1px solid ${active ? accentColor : "oklch(0.36 0.051 250 / 0.6)"}`,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link
          href="/trades"
          style={{
            cursor: "pointer",
            width: 34,
            height: 34,
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid oklch(0.36 0.051 250 / 0.6)",
            background: "oklch(0.18 0.034 250)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M10 3L5 8l5 5" fill="none" stroke="oklch(0.85 0.017 250)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div>
          <PageTitle>{title}</PageTitle>
          <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ ...glassCard, maxWidth: 640 }}>
        <form action={action}>
          <div className="trade-form-grid">
            <div>
              {fieldLabel("Date")}
              <input type="date" name="date" defaultValue={initial.date} style={monoInputStyle} />
            </div>
            <div>
              {fieldLabel("Time")}
              <input type="time" name="time" defaultValue={initial.time} style={monoInputStyle} />
            </div>
            <div>
              {fieldLabel("Symbol")}
              <input type="text" name="symbol" defaultValue={initial.symbol} placeholder="e.g. ES" style={inputStyle} />
            </div>
            <div>
              {fieldLabel("Market")}
              <input type="text" name="market" defaultValue={initial.market} placeholder="Futures / Stocks / Crypto" style={inputStyle} />
            </div>
            <div>
              {fieldLabel("Setup")}
              <select name="setup" defaultValue={initial.setup} style={inputStyle}>
                {SETUP_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {fieldLabel("Risque $")}
              <input
                type="text"
                name="risk"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                placeholder={suggestedRisk ?? "250"}
                style={monoInputStyle}
              />
              {/* The R:R is no longer a field: typed beside a P&L, the two could
                  contradict each other. It is shown here as it is computed. */}
              <div
                style={{
                  fontSize: 11.5,
                  color: "oklch(0.55 0.03 250)",
                  marginTop: 5,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                }}
              >
                {computedRR == null ? (
                  suggestedRisk ? `≈ ${suggestedRisk} $ pour ${sizeValue} lot(s)` : "R:R calculé depuis le risque"
                ) : (
                  <>
                    R:R{" "}
                    <span style={{ color: computedRR >= 0 ? accentColor : lossColor, fontWeight: 600 }}>
                      {computedRR.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              {fieldLabel("Side")}
              <input type="hidden" name="side" value={side} />
              <div style={{ display: "flex", gap: 10 }}>
                <div onClick={() => setSide("Long")} style={toggleBtnStyle(side === "Long")}>
                  Long
                </div>
                <div onClick={() => setSide("Short")} style={toggleBtnStyle(side === "Short")}>
                  Short
                </div>
              </div>
            </div>

            <div>
              {fieldLabel("Size")}
              <input
                type="text"
                name="size"
                value={size}
                onChange={(e) => onSizeChange(e.target.value)}
                placeholder="0"
                style={monoInputStyle}
              />
            </div>
            <div>
              {fieldLabel("P&L")}
              <input
                type="text"
                name="pnl"
                value={pnl}
                onChange={(e) => setPnl(e.target.value)}
                placeholder="0.00"
                style={monoInputStyle}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              {fieldLabel("Emotion")}
              <input type="hidden" name="emotion" value={emotion} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                {EMOTIONS.map((em) => (
                  <div key={em} onClick={() => setEmotion(em)} style={toggleBtnStyle(emotion === em)}>
                    {em}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              {fieldLabel("Pre trade analysis")}
              <textarea
                name="preTradeNotes"
                defaultValue={initial.preTradeNotes}
                placeholder="Setup context, execution notes, lessons…"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              {fieldLabel("Post trade analysis")}
              <textarea
                name="postTradeNotes"
                defaultValue={initial.postTradeNotes}
                placeholder="What happened, what you'd do differently…"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              {fieldLabel("Chart screenshots")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {CHART_SLOTS.map((slot) => (
                  <ChartSlotInput
                    key={slot.key}
                    slotKey={slot.key}
                    label={slot.label}
                    initialSrc={existingCharts[slot.key]}
                    tradeId={tradeId}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <button
              type="submit"
              style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "11px 20px", borderRadius: 9, background: accentColor, color: "oklch(0.12 0.017 250)", border: "none" }}
            >
              Save Trade
            </button>
            <Link
              href="/trades"
              style={{
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                padding: "11px 20px",
                borderRadius: 9,
                border: "1px solid oklch(0.36 0.051 250 / 0.6)",
                color: "oklch(0.75 0.034 250)",
                textDecoration: "none",
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
        {deleteAction && (
          <form action={deleteAction} style={{ marginTop: 12 }}>
            <button
              type="submit"
              style={{
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                padding: "11px 20px",
                borderRadius: 9,
                border: "1px solid oklch(0.62 0.24 18 / 0.5)",
                background: "transparent",
                color: "oklch(0.7 0.25 18)",
              }}
            >
              Delete Trade
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
