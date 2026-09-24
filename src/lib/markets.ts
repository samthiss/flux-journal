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

/**
 * The contract being read, shared by everything that shows it.
 *
 * It used to live in the checklist's own state and reset to the first of the
 * list on every visit — which was invisible while only that page used it, and
 * became wrong the moment the news band had to show the same releases as the
 * calendar. Kept in the browser, like the markets themselves, and published as
 * a store so a page that did not change it still hears about it.
 */
const MARKET_STORAGE_KEY = "checklistMarket";
const abonnes = new Set<() => void>();
let courant: string | null | undefined;

export function loadMarket(): string {
  if (courant === undefined) {
    try {
      courant = window.localStorage.getItem(MARKET_STORAGE_KEY);
    } catch {
      courant = null;
    }
  }
  const marches = loadMarkets();
  // A market dropped from the list is no longer a market to read.
  return courant && marches.includes(courant) ? courant : marches[0];
}

export function saveMarket(market: string) {
  courant = market;
  try {
    window.localStorage.setItem(MARKET_STORAGE_KEY, market);
  } catch {
    // ignore storage failures
  }
  for (const abonne of abonnes) abonne();
}

/** For `useSyncExternalStore`: the server has no market to read. */
export const marketStore = {
  subscribe(listener: () => void) {
    abonnes.add(listener);
    // Another tab of the same journal counts as a change here too.
    const ailleurs = (e: StorageEvent) => {
      if (e.key === MARKET_STORAGE_KEY) {
        courant = e.newValue;
        listener();
      }
    };
    window.addEventListener("storage", ailleurs);
    return () => {
      abonnes.delete(listener);
      window.removeEventListener("storage", ailleurs);
    };
  },
  lu: () => loadMarket(),
  auServeur: (): string | null => null,
};

export function saveMarkets(markets: string[]) {
  try {
    window.localStorage.setItem(MARKETS_STORAGE_KEY, JSON.stringify(markets));
  } catch {
    // ignore storage failures
  }
}

/**
 * The currencies whose figures move a contract.
 *
 * A three-star print only counts where it lands: Chinese trade at 5h explains
 * nothing about sterling, and marking a 6B hour with it throws away an hour
 * that was perfectly ordinary. The dollar is in every list — a payrolls number
 * moves cable as surely as it moves the index.
 */
const CONTRACT_CURRENCY: Record<string, string> = {
  "6E": "EUR",
  "6B": "GBP",
  "6J": "JPY",
  "6C": "CAD",
  "6A": "AUD",
  "6N": "NZD",
  "6S": "CHF",
};

export function currenciesFor(market: string): string[] {
  const own = CONTRACT_CURRENCY[market];
  return own ? [own, "USD"] : ["USD"];
}
