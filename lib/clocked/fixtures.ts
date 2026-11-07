import { z } from "zod";
import { ENDPOINTS, type Endpoint } from "./types";

/**
 * One saved Clocked exchange. `synthetic: true` means FixProof's key did not
 * produce it: it was copied from a Clocked reference page or built from the
 * documented shape. Only `source: "live"` fixtures are real responses to our
 * own requests, and only those carry usage headers.
 */
export const FixtureSchema = z.object({
  synthetic: z.boolean(),
  source: z.enum(["live", "docs-example", "docs-shape"]),
  recorded_at: z.string().nullable(),
  note: z.string().optional(),
  endpoint: z.enum(ENDPOINTS as unknown as [Endpoint, ...Endpoint[]]),
  scenario: z.string().min(1),
  step: z.string().min(1),
  status: z.number().int(),
  request: z.unknown(),
  response: z.unknown(),
  headers: z.record(z.string(), z.string()),
});

export type Fixture = z.infer<typeof FixtureSchema>;

/** Step names may contain ":" (e.g. "rerank:expand"); file names may not. */
export function fixtureFileName(step: string): string {
  const slug = step
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`invalid fixture step name: "${step}"`);
  return `${slug}.json`;
}

/** Usage headers worth keeping. Everything else (cookies, request ids, auth echoes) is dropped before saving. */
export const KEPT_HEADERS = [
  "x-clocked-credits",
  "x-clocked-model-ms",
  "x-clocked-cost-usd",
  "x-clocked-cost-basis",
  "x-clocked-transport",
  "server-timing",
] as const;

export function keepUsageHeaders(headers: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = headers[name];
    if (value !== undefined) kept[name] = value;
  }
  return kept;
}

export interface FixtureStore {
  get(scenario: string, step: string): Promise<Fixture | null>;
  put(fixture: Fixture): Promise<void>;
}

/** In-memory store, used by tests and as a cache in front of the file store. */
export function createMemoryFixtureStore(initial: Fixture[] = []): FixtureStore {
  const map = new Map<string, Fixture>();
  const key = (scenario: string, step: string) => `${scenario}/${fixtureFileName(step)}`;
  for (const f of initial) map.set(key(f.scenario, f.step), FixtureSchema.parse(f));
  return {
    async get(scenario, step) {
      return map.get(key(scenario, step)) ?? null;
    },
    async put(fixture) {
      map.set(key(fixture.scenario, fixture.step), FixtureSchema.parse(fixture));
    },
  };
}
