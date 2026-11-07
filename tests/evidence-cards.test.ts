import { describe, expect, it } from "vitest";
import { cleanQuote, failedAs } from "@/components/console/EvidenceCards";

describe("evidence card helpers", () => {
  it("strips markdown heading lines from Compare quotes", () => {
    expect(cleanQuote("## Split tunnelling\nSplit tunnelling is allowed for Teams.\n### Note\n  Ask IT first.")).toBe("Split tunnelling is allowed for Teams. Ask IT first.");
  });
  it("words a failed check the way the handoff does", () => {
    expect(failedAs({ id: "script", label: "Fix script is in scope", detail: "is malicious" })).toBe("The knowledge-base fix script is outside the approved scope (is malicious)");
  });
});
