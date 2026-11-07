/** Parse the usage headers every Clocked response carries (docs: Responses, Timing and usage). */
export interface UsageHeaders {
  credits: number | null;
  modelMs: number | null;
  costUsd: number | null;
  costBasis: string | null;
  transport: string | null;
  retryAfterMs: number | null;
}

function num(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseUsageHeaders(headers: Record<string, string>): UsageHeaders {
  const h = (name: string) => headers[name] ?? headers[name.toLowerCase()];
  const retryAfter = num(h("retry-after"));
  return {
    credits: num(h("x-clocked-credits")),
    modelMs: num(h("x-clocked-model-ms")),
    costUsd: num(h("x-clocked-cost-usd")),
    costBasis: h("x-clocked-cost-basis") ?? null,
    transport: h("x-clocked-transport") ?? null,
    retryAfterMs: retryAfter === null ? null : Math.max(0, retryAfter * 1000),
  };
}
