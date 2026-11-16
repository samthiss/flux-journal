/**
 * Starts the phone reminders with the server: one pass a minute, on the one
 * instance Railway runs. Not during the build, and not on the edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { remindersTick } = await import("@/lib/reminders");
  const run = () => remindersTick().catch((e) => console.error("reminders:", e));
  setInterval(run, 60000);
  setTimeout(run, 15000);
}
