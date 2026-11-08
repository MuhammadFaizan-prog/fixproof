import { describe, expect, it } from "vitest";
import { decideOutcome } from "@/lib/agent/policy";
import { deviceQuestionFor, deviceUnknown, type Passage } from "@/lib/agent/steps/retrieve";
import type { UnderstandResult } from "@/lib/agent/steps/understand";
import { getPersona } from "@/data/personas";

const sam = getPersona("sam-us-contractor")!;
const priya = getPersona("priya-us-design")!;
const u = (device: string | null) => ({ extracted: { device: device ? { value: device } : null, errorCodes: [], apps: [] } }) as unknown as UnderstandResult;
const p = (id: string, os: Passage["os"], relevance: number): Passage => ({ id: `${id}#0`, articleId: id, title: id, section: "Fix", text: "t", updated: "2026-01-01", os, region: ["any"], script: null, relevance, widened: false, chunkIds: [`${id}#0`] });

describe("Which device? (missing information)", () => {
  it("the device is unknown only with no device on file and none named in the ticket or by Extract", () => {
    expect(deviceUnknown(sam, "My VPN keeps disconnecting", u(null))).toBe(true);
    expect(deviceUnknown(sam, "My VPN keeps disconnecting on my MacBook", u(null))).toBe(false);
    expect(deviceUnknown(sam, "My VPN keeps disconnecting", u("ThinkPad"))).toBe(false);
    expect(deviceUnknown(sam, "My VPN keeps disconnecting", u("laptop"))).toBe(true);
    expect(deviceUnknown(priya, "My VPN keeps disconnecting", u(null))).toBe(false);
  });

  it("asks when relevant single-OS fixes cover two or more operating systems", () => {
    const q = deviceQuestionFor([p("vpn-windows-drops", ["windows"], 0.9), p("vpn-macos-drops", ["macos"], 0.8), p("vpn-policy-2026", ["any"], 0.7)]);
    expect(q?.platforms).toEqual(["windows", "macos"]);
    expect(q?.text).toBe("Which device is this on: a Windows PC or a Mac? The fix is different on each, so I will send the steps for yours as soon as you tell me.");
    expect(deviceQuestionFor([p("a", ["linux"], 0.5), p("b", ["windows"], 0.5), p("c", ["macos"], 0.5)])?.text).toMatch(/a Windows PC, a Mac or a Linux computer\?/);
  });

  it("does not ask when the fixes do not differ by OS, or the other OS is barely relevant", () => {
    expect(deviceQuestionFor([p("a", ["windows"], 0.9), p("b", ["any"], 0.9)])).toBeNull();
    expect(deviceQuestionFor([p("a", ["windows"], 0.9), p("b", ["macos"], 0.1)])).toBeNull();
    // Rerank's "different setup" skips count at any score: same topic, other OS.
    expect(deviceQuestionFor([p("pol", ["any"], 0.99)], [p("w", ["windows"], 0.01), p("m", ["macos"], 0.01)])?.platforms).toEqual(["windows", "macos"]);
    expect(deviceQuestionFor([p("pol", ["any"], 0.99)], [p("w", ["windows"], 0.01)])).toBeNull();
    expect(deviceQuestionFor([p("a", ["windows", "macos"], 0.9), p("b", ["linux"], 0.9)])).toBeNull();
  });

  it("the device check confirms with the employee and decides the outcome ahead of Decide", () => {
    const o = decideOutcome({ screen: { canContinue: true, quarantined: false }, band: "confirm", bandReason: "x", retrievedCount: null, deviceQuestion: { platforms: ["windows", "macos"] } });
    expect(o.outcome).toBe("CONFIRM_WITH_USER");
    expect(o.deciding?.id).toBe("device");
    expect(o.checks.map((c) => c.id)).not.toContain("retrieval");
  });

  it("without a device question the checks are unchanged", () => {
    const o = decideOutcome({ screen: { canContinue: true, quarantined: false }, band: "auto", retrievedCount: 2 });
    expect(o.checks.map((c) => c.id)).toEqual(["clocked", "screen", "policy", "retrieval"]);
  });
});
