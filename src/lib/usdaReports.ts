import { chicagoInstant } from "@/lib/databento/clock";
import type { EconomicEvent } from "@/lib/economicCalendar";

/**
 * The USDA reports the grains jump on, filed as releases of their own
 * "currency", USDA, which ZS, ZW and ZC follow beside the dollar.
 *
 * Neither calendar source lists them, and they are the grains' biggest
 * figures: on 10.11.2026 (WASDE) ZS went from 1188 to 1224.5 in one minute,
 * through a level, the order and its stop. All at 12:00 New York, 11:00
 * Chicago. WASDE dates as USDA publishes them (2027's from the October 2026
 * report); the quarterly Grain Stocks, with Prospective Plantings in March and
 * Acreage in June, on their usual days — check them against USDA's calendar
 * when a year starts.
 */
const REPORTS: [string, string][] = [
  ["2025-11-14", "WASDE + Crop Production"],
  ["2025-12-09", "WASDE"],
  ["2026-01-12", "WASDE + Crop Production annuelle + Grain Stocks"],
  ["2026-02-10", "WASDE"],
  ["2026-03-10", "WASDE"],
  ["2026-03-31", "Prospective Plantings + Grain Stocks"],
  ["2026-04-09", "WASDE"],
  ["2026-05-12", "WASDE"],
  ["2026-06-11", "WASDE"],
  ["2026-06-30", "Acreage + Grain Stocks"],
  ["2026-07-10", "WASDE"],
  ["2026-08-12", "WASDE"],
  ["2026-09-11", "WASDE"],
  ["2026-09-30", "Grain Stocks"],
  ["2026-10-09", "WASDE"],
  ["2026-11-10", "WASDE"],
  ["2026-12-10", "WASDE"],
  ["2027-01-12", "WASDE + Crop Production annuelle + Grain Stocks"],
  ["2027-02-10", "WASDE"],
  ["2027-03-10", "WASDE"],
  ["2027-03-31", "Prospective Plantings + Grain Stocks"],
  ["2027-04-09", "WASDE"],
  ["2027-05-12", "WASDE"],
  ["2027-06-11", "WASDE"],
  ["2027-06-30", "Acreage + Grain Stocks"],
  ["2027-07-09", "WASDE"],
  ["2027-08-12", "WASDE"],
  ["2027-09-10", "WASDE"],
  ["2027-09-30", "Grain Stocks"],
  ["2027-10-08", "WASDE"],
  ["2027-11-10", "WASDE"],
  ["2027-12-10", "WASDE"],
];

export const USDA = "USDA";

/** The reports between two instants, as three-star releases. */
export function usdaBetween(from: Date, to: Date): EconomicEvent[] {
  return REPORTS.flatMap(([day, title]) => {
    const [y, m, d] = day.split("-").map(Number);
    const at = chicagoInstant(y, m, d, 11, 0);
    if (at < from.getTime() || at >= to.getTime()) return [];
    return [{ at: new Date(at).toISOString(), date: day, currency: USDA, title, impact: "high" as const, forecast: "", previous: "", actual: "", kind: "release" as const, category: "agri" }];
  });
}
