import { describe, expect, it } from "vitest";
import { decideBand, BANDS } from "@/lib/agent/policy";
import { decideRequest, extractRequest, fillRequest, understand } from "@/lib/agent/steps/understand";
import { PERSONAS } from "@/data/personas";
import { fakeContext, finalEvents, shaped } from "./helpers/fake-client";

const TEXT = "Hi, it's <PERSON>. My VPN keeps dropping every five minutes since yesterday's update, error 809. I have a client demo at 3pm today. I'm on my MacBook, NW-MBP-0193.";

const extract = shaped("understand:extract", "extract", {
  fields: {
    error_code: { value: ["809"], items: [{ value: "809", start: 92, end: 95, confidence: 1 }] },
    asset_tag: { value: "NW-MBP-0193", start: 147, end: 158, confidence: 1 },
    app_names: { value: ["VPN"], items: [{ value: "VPN", start: 22, end: 25, confidence: 0.9 }] },
    deadline: { value: "3pm", start: 122, end: 125, confidence: 0.99 },
    device: { value: "MacBook", start: 134, end: 141, confidence: 0.99 },
  },
});
const fill = shaped("understand:fill", "fill", {
  fields: {
    category: { value: "network", confidence: 0.9, probabilities: { network: 0.91, hardware: 0.02 } },
    severity: { value: "high", confidence: 0.6, probabilities: { low: 0.05, medium: 0.2, high: 0.7, critical: 0.05 } },
    affected_service: { value: "VPN", start: 22, end: 25 },
    needs_admin: { value: false, confidence: 0.97, probabilities: { yes: 0.03, no: 0.97 } },
  },
});
const decide = (p: Record<string, number>, safe = 0.99) =>
  shaped("understand:decide", "decide", {
    answers: {
      policy: { type: "choice", choice: Object.entries(p).sort((a, b) => b[1] - a[1])[0][0], probabilities: p, confidence: 0.9 },
      self_service_safe: { type: "noul", noul: safe, decision: safe >= 0.5, threshold: 0.5 },
    },
  });

describe("decideBand", () => {
  it("auto-resolves only with a confident auto_resolve and safe self-service", () => {
    expect(decideBand({ auto_resolve: 0.98, suggest: 0.01, escalate: 0.01 }, 0.99).band).toBe("auto");
    expect(decideBand({ auto_resolve: 0.98 }, 0.3).band).toBe("confirm");
    expect(decideBand({ auto_resolve: BANDS.autoMin - 0.01, suggest: 0.2 }, 0.99).band).toBe("confirm");
  });
  it("treats a close call between auto and escalate as confirm, not escalate", () => {
    expect(decideBand({ auto_resolve: 0.39, suggest: 0.07, escalate: 0.54 }, 0.84).band).toBe("confirm");
    expect(decideBand({ escalate: BANDS.escalateMin }, 0.99).band).toBe("escalate");
  });
});

describe("understand step", () => {
  it("builds requests that only read the safe text", () => {
    expect(extractRequest(TEXT).text).toBe(TEXT);
    expect(fillRequest(TEXT).fields.category).toMatchObject({ type: "choice", allow_none: true });
    const d = decideRequest(TEXT, { category: "network", categoryConfidence: 0.9, severity: "high", severityProbabilities: {}, affectedService: null, needsAdmin: false, needsAdminProbability: 0 }, PERSONAS[1]);
    expect(d.state).toMatchObject({ ticket: TEXT, employee: { os: "macOS 15" } });
    expect(Object.keys(d.questions)).toEqual(["policy", "self_service_safe"]);
  });

  it("turns Extract, Fill and Decide into values, highlights and a band", async () => {
    const { ctx, events } = fakeContext([extract, fill, decide({ auto_resolve: 0.98, suggest: 0.01, escalate: 0.01 })]);
    const u = await understand(ctx, TEXT);
    expect(u.extracted.errorCodes.map((v) => v.value)).toEqual(["809"]);
    expect(u.extracted.assetTag?.value).toBe("NW-MBP-0193");
    expect(u.record).toMatchObject({ category: "network", severity: "high", needsAdmin: false });
    expect(u.policy).toMatchObject({ choice: "auto_resolve", band: "auto" });
    const rows = finalEvents(events);
    expect(rows.get("understand:extract")!.evidence!.find((m) => m.label === "error")).toMatchObject({ target: "masked", start: 92, end: 95 });
    expect(rows.get("understand:extract")!.effect).toMatch(/boost the knowledge-base search/);
    expect(rows.get("understand:fill")!.effect).toMatch(/Category network \(91%\)/);
    expect(rows.get("understand:decide")!.effect).toMatch(/may auto-resolve/);
  });

  it("says plainly when the ticket states nothing to extract", async () => {
    const empty = shaped("understand:extract", "extract", { fields: { error_code: { value: [] }, asset_tag: { value: null }, app_names: { value: [] }, deadline: { value: null }, device: { value: null } } });
    const { ctx, events } = fakeContext([empty, fill, decide({ auto_resolve: 0.01, suggest: 0.97, escalate: 0.02 }, 0.25)]);
    const u = await understand(ctx, "my computer is weird today");
    expect(u.extracted.errorCodes).toEqual([]);
    expect(u.policy.band).toBe("confirm");
    expect(finalEvents(events).get("understand:extract")!.effect).toMatch(/states no error code/);
  });

  it("escalates an access request", async () => {
    const { ctx } = fakeContext([extract, fill, decide({ auto_resolve: 0.002, suggest: 0.002, escalate: 0.996 }, 0.002)]);
    expect((await understand(ctx, "Please add me to Domain Admins.")).policy.band).toBe("escalate");
  });

  it("fails loudly when Decide returns no policy", async () => {
    const bad = shaped("understand:decide", "decide", { answers: {} });
    const { ctx, events } = fakeContext([extract, fill, bad]);
    await expect(understand(ctx, TEXT)).rejects.toThrow(/no policy/);
    expect(finalEvents(events).get("understand:decide")).toMatchObject({ status: "error" });
  });
});
