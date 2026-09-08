export const DEFAULT_MARKETS = ["ES", "NQ", "YM", "RTY", "GC", "CL", "6E", "6B"];

/**
 * Markets added to a list that was saved before they existed.
 *
 * A stored list wins over the defaults, so a contract added here would never
 * reach anyone who had already touched the selector. These are merged in once,
 * and the flag makes sure a market removed on purpose stays removed.
 */
const LATE_ARRIVALS = ["6B"];
const MERGED_KEY = "checklistMarketsMerged";
const MARKETS_STORAGE_KEY = "checklistMarkets";

export function loadMarkets(): string[] {
  try {
    const raw = window.localStorage.getItem(MARKETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (window.localStorage.getItem(MERGED_KEY)) return parsed;
        window.localStorage.setItem(MERGED_KEY, "1");
        const missing = LATE_ARRIVALS.filter((m) => !parsed.includes(m));
        if (missing.length === 0) return parsed;
        const merged = [...parsed, ...missing];
        saveMarkets(merged);
        return merged;
      }
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
