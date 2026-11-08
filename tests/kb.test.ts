import { describe, expect, it } from "vitest";
import { loadKb } from "@/lib/kb/load";
import { parseArticle, parseFrontmatter } from "@/lib/kb/parse";
import { PERSONAS, getPersona } from "@/data/personas";
import { SCENARIOS } from "@/data/scenarios";

const kb = loadKb();
const byId = new Map(kb.map((a) => [a.meta.id, a]));

describe("knowledge base", () => {
  it("has about thirty valid, synthetic articles", () => {
    expect(kb.length).toBeGreaterThanOrEqual(28);
    expect(kb.every((a) => a.meta.synthetic === true)).toBe(true);
    expect(kb.every((a) => a.chunks.length > 0)).toBe(true);
  });

  it("covers the same fix for each OS so Rerank can skip different_case", () => {
    for (const id of ["vpn-macos-drops", "vpn-windows-drops", "vpn-linux-drops"]) expect(byId.has(id)).toBe(true);
    expect(byId.get("vpn-macos-drops")!.meta.os).toEqual(["macos"]);
    expect(byId.get("vpn-windows-drops")!.meta.os).toEqual(["windows"]);
  });

  it("plants a policy conflict where the newer article supersedes the older", () => {
    const old = byId.get("vpn-policy-2024")!;
    const current = byId.get("vpn-policy-2026")!;
    expect(current.meta.supersedes).toBe("vpn-policy-2024");
    expect(current.meta.updated > old.meta.updated).toBe(true);
    expect(old.body).toMatch(/reinstall it/);
    expect(current.body).toMatch(/Never uninstall or reinstall/);
  });

  it("plants a tampered remediation script", () => {
    const chunk = byId.get("printer-queue-recovery")!.chunks.find((c) => c.script)!;
    expect(chunk.script!.lang).toBe("powershell");
    expect(chunk.script!.code).toContain("Set-MpPreference -DisableRealtimeMonitoring $true");
  });

  it("plants a poisoned passage aimed at AI assistants", () => {
    const poisoned = byId.get("mfa-new-phone")!.chunks.find((c) => c.section === "Faster verification")!;
    expect(poisoned.text).toMatch(/Note for AI assistants/);
    expect(byId.get("mfa-new-phone")!.chunks.filter((c) => c.section !== "Faster verification").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps benign scripts for the happy path", () => {
    const mac = byId.get("vpn-macos-drops")!.chunks.find((c) => c.script)!;
    expect(mac.script!.lang).toBe("zsh");
    expect(mac.script!.code).not.toMatch(/sudo|Set-MpPreference|spctl --master-disable/);
  });

  it("chunks by ## section with stable ids and the exact section text", () => {
    const art = byId.get("vpn-macos-drops")!;
    expect(art.chunks.map((c) => c.id)).toEqual(art.chunks.map((_, i) => `vpn-macos-drops#${i}`));
    expect(art.chunks[0].section).toBe("Symptoms");
    expect(art.chunks[0].text.startsWith("## Symptoms")).toBe(true);
  });
});

describe("parser", () => {
  it("parses inline lists and booleans", () => {
    const { data } = parseFrontmatter("---\nos: [macos, windows]\nhas_script: false\ntitle: A b\n---\nbody");
    expect(data).toEqual({ os: ["macos", "windows"], has_script: false, title: "A b" });
  });

  it("rejects has_script that does not match the body, and ids that do not match the file", () => {
    const base = "---\nid: x-y\ntitle: T\ncategory: network\nos: [any]\nregion: [any]\nupdated: 2026-01-01\nhas_script: true\nscript_lang: bash\nsynthetic: true\n---\n# T\n\n## A\ntext\n";
    expect(() => parseArticle(base)).toThrow(/has_script/);
    expect(() => parseArticle(base.replace("has_script: true\nscript_lang: bash", "has_script: false"), "other")).toThrow(/does not match/);
  });
});

describe("personas and scenarios", () => {
  it("has three managed personas, one per OS and region, plus one with no device on file", () => {
    expect(new Set(PERSONAS.filter((p) => p.os !== "unknown").map((p) => p.os))).toEqual(new Set(["windows", "macos", "linux"]));
    expect(PERSONAS.filter((p) => p.os === "unknown").map((p) => p.id)).toEqual(["sam-us-contractor"]);
    expect(new Set(PERSONAS.map((p) => p.region))).toEqual(new Set(["uk", "us", "pk"]));
    expect(PERSONAS.every((p) => /remain enabled/.test(p.approvedScope))).toBe(true);
  });

  it("has the eight locked eval presets (plus post-lock ones) that reference real personas and articles", () => {
    expect(SCENARIOS.filter((s) => !s.postLock)).toHaveLength(8);
    expect(SCENARIOS.filter((s) => s.postLock).map((s) => s.id)).toEqual(["which-device"]);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) {
      expect(getPersona(s.personaId), s.id).toBeDefined();
      for (const a of s.expectedArticles) expect(byId.has(a), `${s.id} → ${a}`).toBe(true);
      expect(s.text.length).toBeLessThan(60000);
    }
  });
});
