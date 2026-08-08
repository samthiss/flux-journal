import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const SOURCE_FILE =
  process.argv[2] ??
  "/private/tmp/claude-501/-Users-samuelthissen/d5b5ad1a-925d-432e-8401-fcfd17af42ff/scratchpad/trades-export-2026-08-07.md";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const EMOTION_MAP: Record<string, string> = {
  "ruhig & gelassen": "Calm",
  "nervös": "Nervous",
  "nervos": "Nervous",
  "ungeduldig": "Impatient",
  "frustriert": "Frustrated",
  "vorsichtig": "Cautious",
};

const CHART_LABEL_TO_FIELD: Record<string, string> = {
  Cluster: "chartCluster",
  Reverse: "chartReverse",
  Box: "chartBox",
  Trading: "chartTrading",
};

type ParsedTrade = {
  date: string;
  time: string | null;
  symbol: string;
  side: string;
  size: number;
  pnl: number;
  setup: string;
  emotion: string | null;
  preTradeNotes: string | null;
  postTradeNotes: string | null;
  charts: Record<string, string>;
  extraImages: { label: string; url: string }[];
};

function parseField(block: string, field: string): string | null {
  const re = new RegExp(`\\|\\s*${field}\\s*\\|\\s*(.*?)\\s*\\|`, "i");
  const m = block.match(re);
  if (!m) return null;
  const v = m[1].trim();
  return v === "—" || v === "" ? null : v;
}

function parseNumber(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, ".").match(/[-+]?[0-9]*\.?[0-9]+/);
  return m ? parseFloat(m[0]) : null;
}

function mapEmotion(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return EMOTION_MAP[key] ?? null;
}

function mapSetup(raw: string | null): string {
  if (!raw) return "Trend run";
  const key = raw.trim().toLowerCase();
  if (key === "trend run") return "Trend run";
  if (key === "backtest reverse") return "Backtest reverse";
  return raw;
}

function mapSide(raw: string | null): string {
  if (!raw) return "Long";
  return raw.trim().toLowerCase() === "short" ? "Short" : "Long";
}

function main() {
  const raw = readFileSync(SOURCE_FILE, "utf8");
  const blocks = raw.split(/\n(?=## Trade #)/g).filter((b) => b.startsWith("## Trade #"));

  const parsed: ParsedTrade[] = [];
  let skippedNoImage = 0;

  for (const block of blocks) {
    const headerMatch = block.match(/^## Trade #\d+\s*–\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/);
    if (!headerMatch) continue;
    const date = headerMatch[1];
    const time = headerMatch[2] ?? null;

    const instrument = parseField(block, "Instrument");
    const direction = parseField(block, "Direction");
    const account = parseField(block, "Account");
    const setupRaw = parseField(block, "Setup");
    const result = parseField(block, "Result");
    const pnlRaw = parseField(block, "PnL");
    const tp = parseField(block, "TP");
    const lotsRaw = parseField(block, "Lots");
    const session = parseField(block, "Session");
    const trend30 = parseField(block, "Trend 30D");
    const trend7 = parseField(block, "Trend 7D");
    const emotionRaw = parseField(block, "Emotion");
    const respectsRules = parseField(block, "Respects rules");
    const tags = parseField(block, "Tags");

    const keyPointsMatch = block.match(/\*\*Key points:\*\*\s*([\s\S]*?)(?=\n\*\*Comment:\*\*|\n### Images|\n---|$)/);
    const commentMatch = block.match(/\*\*Comment:\*\*\s*([\s\S]*?)(?=\n### Images|\n---|$)/);
    const keyPoints = keyPointsMatch ? keyPointsMatch[1].trim() : null;
    const comment = commentMatch ? commentMatch[1].trim() : null;

    const imageMatches = [...block.matchAll(/\*\*([^*:]+):\*\*\s*\n\s*!\[[^\]]*\]\(([^)]+)\)/g)];
    const charts: Record<string, string> = {};
    const extraImages: { label: string; url: string }[] = [];
    for (const [, label, url] of imageMatches) {
      const cleanLabel = label.trim();
      const field = CHART_LABEL_TO_FIELD[cleanLabel];
      if (field) {
        charts[field] = url;
      } else {
        extraImages.push({ label: cleanLabel, url });
      }
    }

    if (imageMatches.length === 0) {
      skippedNoImage++;
      continue;
    }

    const metaLines: string[] = [];
    if (account) metaLines.push(`Account: ${account}`);
    if (result) metaLines.push(`Result: ${result}`);
    if (tp) metaLines.push(`TP: ${tp}`);
    if (session) metaLines.push(`Session: ${session}`);
    if (trend30) metaLines.push(`Trend 30D: ${trend30}`);
    if (trend7) metaLines.push(`Trend 7D: ${trend7}`);
    if (respectsRules) metaLines.push(`Respects rules: ${respectsRules}`);
    if (tags) metaLines.push(`Tags: ${tags}`);

    let postTradeNotes = comment ?? "";
    if (metaLines.length) {
      postTradeNotes = `[${metaLines.join(" | ")}]` + (postTradeNotes ? `\n\n${postTradeNotes}` : "");
    }
    if (extraImages.length) {
      const extraText = extraImages.map((i) => `${i.label}: ${i.url}`).join("\n");
      postTradeNotes += `${postTradeNotes ? "\n\n" : ""}Additional charts:\n${extraText}`;
    }

    parsed.push({
      date,
      time,
      symbol: instrument ?? "UNKNOWN",
      side: mapSide(direction),
      size: parseNumber(lotsRaw) ?? 0,
      pnl: parseNumber(pnlRaw) ?? 0,
      setup: mapSetup(setupRaw),
      emotion: mapEmotion(emotionRaw),
      preTradeNotes: keyPoints,
      postTradeNotes: postTradeNotes || null,
      charts,
      extraImages,
    });
  }

  console.log(`Parsed ${parsed.length} trades with images, skipped ${skippedNoImage} without images.`);
  return parsed;
}

async function run() {
  const trades = main();

  for (const t of trades) {
    await prisma.trade.create({
      data: {
        date: new Date(t.date),
        time: t.time,
        symbol: t.symbol,
        market: "Futures",
        side: t.side,
        size: t.size,
        pnl: t.pnl,
        setup: t.setup,
        emotion: t.emotion,
        preTradeNotes: t.preTradeNotes,
        postTradeNotes: t.postTradeNotes,
        ...t.charts,
      },
    });
  }

  console.log(`Imported ${trades.length} trades into the database.`);
}

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
