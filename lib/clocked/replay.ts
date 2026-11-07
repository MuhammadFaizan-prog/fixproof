import { ClockedError } from "./errors";
import { keepUsageHeaders, type FixtureStore } from "./fixtures";
import type { Transport } from "./transport";

/**
 * Answers Clocked calls from saved fixtures instead of the network, keyed by
 * (scenario, step). Goes through the same client code path as live calls, so
 * retries, meta and error handling behave identically. Costs nothing.
 */
export function createReplayTransport({ store, scenario }: { store: FixtureStore; scenario: string }): Transport {
  return {
    kind: "replay",
    async send({ endpoint, step }) {
      const fixture = await store.get(scenario, step);
      if (!fixture) {
        throw new ClockedError(`No fixture for ${scenario}/${step}`, { kind: "no_fixture", endpoint, step, attempts: 1 });
      }
      if (fixture.endpoint !== endpoint) {
        throw new ClockedError(`Fixture ${scenario}/${step} is for ${fixture.endpoint}, not ${endpoint}`, {
          kind: "no_fixture",
          endpoint,
          step,
          attempts: 1,
        });
      }
      return {
        status: fixture.status,
        headers: fixture.headers,
        json: fixture.response,
        replay: { synthetic: fixture.synthetic, recordedAt: fixture.recorded_at },
      };
    },
  };
}

/**
 * Wraps a live transport and saves every successful exchange as a live,
 * non-synthetic fixture. Used only by scripts/ with a real key. Only usage
 * headers are kept; the Authorization header is never part of what is saved.
 */
export function createRecordingTransport({
  inner,
  store,
  scenario,
  today = () => new Date().toISOString().slice(0, 10),
}: {
  inner: Transport;
  store: FixtureStore;
  scenario: string;
  today?: () => string;
}): Transport {
  return {
    kind: inner.kind,
    async send(req) {
      const res = await inner.send(req);
      if (res.status >= 200 && res.status < 300 && res.json !== null) {
        await store.put({
          synthetic: false,
          source: "live",
          recorded_at: today(),
          endpoint: req.endpoint,
          scenario,
          step: req.step,
          status: res.status,
          request: req.body,
          response: res.json,
          headers: keepUsageHeaders(res.headers),
        });
      }
      return res;
    },
  };
}
