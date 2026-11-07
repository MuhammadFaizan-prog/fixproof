import { describe, expect, it } from "vitest";
import { buildKbIndex, getKbIndex, tokenize } from "@/lib/kb/index";
import { loadKb } from "@/lib/kb/load";
import { SCENARIOS } from "@/data/scenarios";

const index = getKbIndex();

describe("BM25 recall", () => {
  it("indexes every chunk of every article", () => {
    const expected = loadKb().reduce((n, a) => n + a.chunks.length, 0);
    expect(index.chunkCount).toBe(expected);
  });

  it.each(SCENARIOS.map((s) => [s.id, s]))("%s: expected articles are in the top 20 chunks", (_id, scenario) => {
    const hits = index.search(scenario.text, { limit: 20 });
    const articles = new Set(hits.map((h) => h.chunk.articleId));
    for (const id of scenario.expectedArticles) expect(articles, `${scenario.id} missing ${id}`).toContain(id);
  });

  it("puts the macOS VPN article first for the macOS VPN ticket", () => {
    const top = index.search("VPN keeps dropping every five minutes on my MacBook, error 809", { limit: 3 });
    expect(top[0].chunk.articleId).toMatch(/^vpn-/);
    expect(top.map((h) => h.chunk.articleId)).toContain("vpn-macos-drops");
  });

  it("returns scores in descending order and the matched terms", () => {
    const hits = index.search("print queue stuck spooler");
    expect(hits.length).toBeGreaterThan(0);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    expect(hits[0].terms.length).toBeGreaterThan(0);
  });

  it("returns nothing for empty or stopword-only queries", () => {
    expect(index.search("   ")).toEqual([]);
    expect(index.search("the and my it")).toEqual([]);
  });

  it("caps results at the limit", () => {
    expect(index.search("vpn printer outlook mfa password laptop", { limit: 5 })).toHaveLength(5);
  });
});

describe("chunk neighbors", () => {
  it("returns the sections before and after, in the same article", () => {
    const n = index.neighbors("vpn-macos-drops#1").map((c) => c.id);
    expect(n).toEqual(["vpn-macos-drops#0", "vpn-macos-drops#2"]);
  });

  it("handles the first and last chunk and a wider radius", () => {
    const chunks = index.articleChunks("vpn-macos-drops");
    expect(index.neighbors(chunks[0].id).map((c) => c.index)).toEqual([1]);
    expect(index.neighbors(chunks[chunks.length - 1].id).map((c) => c.index)).toEqual([chunks.length - 2]);
    expect(index.neighbors(chunks[0].id, 2).map((c) => c.index)).toEqual([1, 2]);
  });

  it("returns nothing for an unknown chunk", () => {
    expect(index.neighbors("nope#0")).toEqual([]);
    expect(index.get("nope#0")).toBeUndefined();
  });
});

describe("tokenizer", () => {
  it("keeps error codes, asset tags and contractions together", () => {
    expect(tokenize("Error 809 on NW-MBP-0193, won't connect")).toEqual(["error", "809", "on", "nw-mbp-0193", "won't", "connect"]);
  });

  it("builds an index from any article set", () => {
    const small = buildKbIndex(loadKb().filter((a) => a.meta.id.startsWith("vpn-")));
    expect(small.search("printer spooler")).toEqual([]);
    expect(small.search("vpn").length).toBeGreaterThan(0);
  });
});
