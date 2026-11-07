import { ENDPOINT_LABEL, type Endpoint } from "@/lib/clocked/types";

export const endpointLabel = (e: Endpoint | "local") => (e === "local" ? "Local" : ENDPOINT_LABEL[e]);
export const pct = (p: number) => `${Math.round(p * 100)}%`;
export function seconds(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}
export function recordedLabel(date: string | null): string {
  if (!date) return "Recorded";
  const d = new Date(`${date}T12:00:00Z`);
  return `Recorded live ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}
