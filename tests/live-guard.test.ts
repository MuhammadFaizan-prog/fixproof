import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/triage/route";
import { GET } from "@/app/api/health/route";
import { clientIp, createLiveGuard, guardConfigFromEnv, resetLiveGuard, type Denial, type Ticket } from "@/lib/server/live-guard";

const cfg = { dailyCreditCap: 100, perIpPerHour: 2, maxInflight: 1, runEstimate: 40 };
const ok = (t: Ticket | Denial): Ticket => {
  if (!t.ok) throw new Error(`denied: ${t.code}`);
  return t;
};

describe("live guard", () => {
  it("reads caps from the environment and falls back on bad values", () => {
    expect(guardConfigFromEnv({ LIVE_DAILY_CREDIT_CAP: "500", LIVE_PER_IP_RUNS_PER_HOUR: "x" } as never)).toMatchObject({ dailyCreditCap: 500, perIpPerHour: 5, maxInflight: 1 });
  });

  it("limits each visitor per sliding hour and says when to retry", () => {
    let t = Date.UTC(2026, 10, 8, 10, 0, 0);
    const g = createLiveGuard({ ...cfg, dailyCreditCap: 10_000 }, () => t);
    ok(g.admit("1.1.1.1")).settle(5);
    t += 60_000;
    ok(g.admit("1.1.1.1")).settle(5);
    const denied = g.admit("1.1.1.1") as Denial;
    expect(denied).toMatchObject({ ok: false, code: "rate_limited" });
    expect(denied.retryAfterSec).toBe(3540);
    ok(g.admit("2.2.2.2")).settle(5); // another visitor is unaffected
    t += 3_541_000;
    expect(g.admit("1.1.1.1").ok).toBe(true);
  });

  it("allows one live run in flight at a time", () => {
    const g = createLiveGuard({ ...cfg, dailyCreditCap: 10_000 });
    const first = ok(g.admit("a"));
    expect(g.admit("b")).toMatchObject({ ok: false, code: "busy" });
    first.settle(10);
    expect(g.admit("b").ok).toBe(true);
  });

  it("reserves an estimate, settles to real credits, and stops at the daily cap until midnight UTC", () => {
    let t = Date.UTC(2026, 10, 8, 23, 0, 0);
    const g = createLiveGuard({ ...cfg, perIpPerHour: 100, maxInflight: 5 }, () => t);
    const a = ok(g.admit("a"));
    ok(g.admit("b")).settle(35); // 40 reserved by a + 35 spent
    expect(g.admit("c")).toMatchObject({ ok: false, code: "daily_cap", retryAfterSec: 3600 });
    a.settle(10);
    a.settle(999); // second settle is ignored
    expect(g.status()).toEqual({ creditsLeftToday: 55, capReached: false });
    ok(g.admit("c")).settle(50);
    expect(g.status().capReached).toBe(true);
    t += 3_600_000; // next UTC day
    expect(g.status()).toEqual({ creditsLeftToday: 100, capReached: false });
  });

  it("uses the first forwarded hop as the visitor address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("live guard in the API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetLiveGuard();
  });
  const post = (body: object) => POST(new Request("http://x/api/triage", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) }));

  it("answers 429 with Retry-After before any Clocked call when the visitor is over the limit", async () => {
    vi.stubEnv("CLOCKED_API_KEY", "fake-key-never-sent");
    vi.stubEnv("LIVE_PER_IP_RUNS_PER_HOUR", "0");
    resetLiveGuard();
    const res = await post({ text: "My VPN keeps dropping.", personaId: "priya-us-design", mode: "live" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await res.json()).toMatchObject({ code: "rate_limited" });
  });

  it("answers 429 daily_cap and health reports live off when the cap is below one run", async () => {
    vi.stubEnv("CLOCKED_API_KEY", "fake-key-never-sent");
    vi.stubEnv("LIVE_DAILY_CREDIT_CAP", "10");
    resetLiveGuard();
    const res = await post({ text: "My VPN keeps dropping.", personaId: "priya-us-design", mode: "live" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_cap" });
    expect(await GET().json()).toMatchObject({ keyConfigured: true, liveAvailable: false, dailyCapReached: true });
  });

  it("never limits preset replays", async () => {
    vi.stubEnv("CLOCKED_API_KEY", "fake-key-never-sent");
    vi.stubEnv("LIVE_PER_IP_RUNS_PER_HOUR", "0");
    vi.stubEnv("LIVE_DAILY_CREDIT_CAP", "0");
    resetLiveGuard();
    const res = await post({ scenarioId: "vpn-macos", personaId: "priya-us-design", mode: "live" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("event: result");
  });
});
