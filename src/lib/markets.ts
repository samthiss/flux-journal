export const DEFAULT_MARKETS = ["ES", "NQ", "YM", "RTY", "GC", "CL", "6E"];
const MARKETS_STORAGE_KEY = "checklistMarkets";

export function loadMarkets(): string[] {
  try {
    const raw = window.localStorage.getItem(MARKETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore storage failures
  }
  return DEFAULT_MARKETS;
}

export function saveMarkets(markets: string[]) {
  try {
    window.localStorage.setItem(MARKETS_STORAGE_KEY, JSON.stringify(markets));
  } catch {
    // ignore storage failures
  }
}
