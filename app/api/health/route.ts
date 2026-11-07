import { hasApiKey } from "@/lib/clocked/client";
import { liveGuard } from "@/lib/server/live-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether live mode is available. Never returns the key or any part of it, or anyone's usage. */
export function GET(): Response {
  const keyConfigured = hasApiKey();
  const cap = keyConfigured ? liveGuard().status() : null;
  return Response.json({ ok: true, keyConfigured, liveAvailable: keyConfigured && !cap?.capReached, dailyCapReached: cap?.capReached ?? false });
}
