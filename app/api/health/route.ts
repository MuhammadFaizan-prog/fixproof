import { hasApiKey } from "@/lib/clocked/client";
import { liveGuard } from "@/lib/server/live-guard";
import { creditLedger } from "@/lib/server/credit-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether live mode is available. Never returns the key or any part of it, or anyone's usage. */
export async function GET(): Promise<Response> {
  const keyConfigured = hasApiKey();
  const guard = keyConfigured ? liveGuard() : null;
  let capReached = guard?.status().capReached ?? false;
  const ledger = keyConfigured ? creditLedger() : null;
  if (guard && ledger) {
    const { dailyCreditCap, runEstimate } = guard.config();
    capReached = capReached || (await ledger.spentToday().then((n) => n + runEstimate > dailyCreditCap).catch(() => true));
  }
  // "global": one daily cap across every serverless instance; "per-instance": each warm instance keeps its own (lower) cap.
  return Response.json({ ok: true, keyConfigured, liveAvailable: keyConfigured && !capReached, dailyCapReached: capReached, liveBudget: ledger ? "global" : "per-instance" });
}
