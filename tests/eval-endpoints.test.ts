import { describe, expect, it } from "vitest";
import endpoints from "@/eval/endpoints.json";
import { renderEndpointsMd, spliceEndpoints } from "@/lib/eval/endpoints";

/** The per-endpoint proof (written by pnpm eval): every endpoint row has a firing case and a quiet case. */
describe("eval/endpoints.json", () => {
  it("covers all 9 endpoints (Guard twice: ticket and knowledge base), each with a firing and a quiet case", () => {
    const names = endpoints.rows.map((r) => r.name.split(" ")[0]);
    expect(new Set(names)).toEqual(new Set(["Protect", "Guard", "Inspect", "Decide", "Extract", "Fill", "Rerank", "Compare", "Verify"]));
    for (const r of endpoints.rows) {
      expect(r.fires, r.name).not.toBeNull();
      expect(r.quiet, r.name).not.toBeNull();
    }
  });

  it("splices the generated table between its markers only", () => {
    const md = renderEndpointsMd(endpoints as never);
    const doc = "a\n<!-- endpoints:start -->\nold\n<!-- endpoints:end -->\nb";
    const out = spliceEndpoints(doc, md);
    expect(out.startsWith("a\n<!-- endpoints:start")).toBe(true);
    expect(out.endsWith("<!-- endpoints:end -->\nb")).toBe(true);
    expect(out).not.toContain("\nold\n");
  });
});
