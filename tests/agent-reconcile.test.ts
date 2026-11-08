import { describe, expect, it } from "vitest";
import { compareRequest, precedence, reconcile, scopeRank } from "@/lib/agent/steps/reconcile";
import { PERSONAS } from "@/data/personas";
import type { Passage } from "@/lib/agent/steps/retrieve";
import { fakeContext, finalEvents, shaped } from "./helpers/fake-client";

const p = (id: string, updated: string, relevance = 0.9): Passage => ({
  id, articleId: id.split("#")[0], title: id.split("#")[0], section: "Policy", text: `text of ${id}`, updated, os: ["any"], region: ["any"], script: null, relevance, widened: false, chunkIds: [id],
});
const v24 = p("vpn-policy-2024#0", "2024-03-01");
const v26 = p("vpn-policy-2026#0", "2026-09-15");
const mac = p("vpn-macos-drops#1", "2026-10-02", 0.99);

const finding = (a: string, b: string) => ({
  kind: "rule_or_condition", confidence: 0.99,
  a: { document: a, quote: "uninstall and reinstall the VPN client", start: 0, end: 38, confidence: 1 },
  b: { document: b, quote: "Never reinstall the VPN client yourself.", start: 0, end: 40, confidence: 1 },
});
const pair = (a: string, b: string, relation: string, conflicts: unknown[] = []) => ({ a, b, relation, related: 0.9, probabilities: { conflicting: relation === "conflicting" ? 0.99 : 0.01 }, duplicates: [], conflicts });
const compare = (pairs: unknown[]) => shaped("reconcile:compare", "compare", { verdict: "x", threshold: 0.5, instructions_used: "default", evidence: "flagged", documents: [], pairs: pairs as never, duplicates: [], overlaps: [], conflicts: [], related_pairs: [] });

describe("reconcile step", () => {
  it("skips Compare with fewer than two passages", async () => {
    const { ctx, events } = fakeContext([]);
    const r = await reconcile(ctx, [mac]);
    expect(r).toMatchObject({ ran: false, used: [mac], conflicts: [] });
    expect(events).toEqual([]);
  });

  it("sends every passage with its id", () => {
    expect(compareRequest([v24, v26]).documents).toEqual([{ id: v24.id, text: v24.text }, { id: v26.id, text: v26.text }]);
  });

  it("lets the newer policy win and removes the older one before drafting", async () => {
    const { ctx, events } = fakeContext([compare([pair(v24.id, v26.id, "conflicting", [finding(v24.id, v26.id)]), pair(v24.id, mac.id, "overlapping"), pair(v26.id, mac.id, "overlapping")])]);
    const r = await reconcile(ctx, [mac, v24, v26]);
    expect(r.used.map((x) => x.id)).toEqual([mac.id, v26.id]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ winner: v26.id, rule: "newer", a: { quote: "uninstall and reinstall the VPN client" }, b: { quote: "Never reinstall the VPN client yourself." } });
    expect(r.unresolved).toBe(0);
    const row = finalEvents(events).get("reconcile:compare")!;
    expect(row).toMatchObject({ verdict: "resolved", count: 1 });
    expect(row.effect).toMatch(/overrides/);
    expect(row.evidence).toHaveLength(2);
  });

  it("leaves a same-date conflict unresolved", async () => {
    const a = p("a#0", "2026-01-01");
    const b = p("b#0", "2026-01-01");
    const { ctx } = fakeContext([compare([pair(a.id, b.id, "conflicting", [finding(a.id, b.id)])])]);
    const r = await reconcile(ctx, [a, b]);
    expect(r.unresolved).toBe(1);
    expect(r.used).toHaveLength(2);
    expect(r.conflicts[0].winner).toBeNull();
  });

  it("drops the weaker of two passages Compare calls the same", async () => {
    const strong = p("x#0", "2026-01-01", 0.95);
    const weak = p("y#0", "2026-01-01", 0.5);
    const { ctx, events } = fakeContext([compare([pair(strong.id, weak.id, "same")])]);
    const r = await reconcile(ctx, [strong, weak]);
    expect(r.used.map((x) => x.id)).toEqual([strong.id]);
    expect(r.removed).toEqual([{ passageId: weak.id, title: weak.title, why: "duplicate" }]);
    expect(finalEvents(events).get("reconcile:compare")!.effect).toMatch(/duplicate/);
  });

  describe("scope-aware precedence (run 2)", () => {
    const bilal = PERSONAS.find((x) => x.region === "pk")!;
    const scoped = (id: string, updated: string, os: Passage["os"], region: Passage["region"]): Passage => ({ ...p(id, updated), os, region });
    const lahore = scoped("guest-wifi-lahore#0", "2026-05-12", ["any"], ["pk"]);
    const global = scoped("guest-wifi-policy#0", "2026-10-01", ["any"], ["any"]);

    it("ranks scope by how specifically it is written for the employee", () => {
      expect(scopeRank(lahore, bilal)).toBe(1);
      expect(scopeRank(global, bilal)).toBe(0);
      expect(scopeRank(scoped("x#0", "2026-01-01", ["any"], ["uk"]), bilal)).toBe(-1);
      expect(scopeRank(scoped("y#0", "2026-01-01", [bilal.os], ["pk"]), bilal)).toBe(2);
    });

    it("same scope: newer wins; same scope and date: no winner", () => {
      expect(precedence(v24, v26, bilal, "scope")).toMatchObject({ winner: v26, rule: "newer" });
      const a = p("a#0", "2026-01-01");
      const b = p("b#0", "2026-01-01");
      expect(precedence(a, b, bilal, "scope")).toEqual({ winner: null, rule: null });
    });

    it("different scope: the office article beats a newer company-wide one; the locked rule still picks the newer", () => {
      expect(precedence(global, lahore, bilal, "scope")).toMatchObject({ winner: lahore, rule: "scope" });
      expect(precedence(global, lahore, bilal, "newer")).toMatchObject({ winner: global, rule: "newer" });
    });

    it("a conflicting pair across scopes keeps the scoped article and removes the company-wide one", async () => {
      const { ctx } = fakeContext([compare([pair(global.id, lahore.id, "conflicting", [finding(global.id, lahore.id)])])], bilal.id);
      const r = await reconcile(ctx, [global, lahore]);
      expect(r.used.map((x) => x.id)).toEqual([lahore.id]);
      expect(r.conflicts[0]).toMatchObject({ winner: lahore.id, rule: "scope", basis: "conflict" });
      expect(r.removed).toEqual([{ passageId: global.id, title: global.title, why: "out_of_scope" }]);
      expect(r.unresolved).toBe(0);
    });

    it("an overlapping pair: the office article governs over the company-wide one", async () => {
      const { ctx, events } = fakeContext([compare([pair(global.id, lahore.id, "overlapping")])], bilal.id);
      const r = await reconcile(ctx, [global, lahore]);
      expect(r.used.map((x) => x.id)).toEqual([lahore.id]);
      expect(r.conflicts[0]).toMatchObject({ kind: "office_scope", winner: lahore.id, rule: "scope", basis: "overlap" });
      expect(finalEvents(events).get("reconcile:compare")!.effect).toMatch(/office \(Lahore\)/);
    });

    it("an overlapping pair with no office article stays untouched (OS how-to beside a company policy)", async () => {
      const macHowTo = scoped("vpn-macos-drops#0", "2026-10-02", ["macos"], ["any"]);
      const { ctx } = fakeContext([compare([pair(v26.id, macHowTo.id, "overlapping")])], "priya-us-design");
      const r = await reconcile(ctx, [macHowTo, v26]);
      expect(r.used).toHaveLength(2);
      expect(r.conflicts).toEqual([]);
    });

    it("the locked rule ignores overlap", async () => {
      const { ctx } = fakeContext([compare([pair(global.id, lahore.id, "overlapping")])], bilal.id);
      const r = await reconcile({ ...ctx, conflictRule: "newer" }, [global, lahore]);
      expect(r.used).toHaveLength(2);
    });
  });
});
