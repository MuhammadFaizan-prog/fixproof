import { hasApiKey } from "@/lib/clocked/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether live mode is available. Never returns the key or any part of it. */
export function GET(): Response {
  const keyConfigured = hasApiKey();
  return Response.json({ ok: true, keyConfigured, liveAvailable: keyConfigured });
}
