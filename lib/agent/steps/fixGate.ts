import type { ScriptRequest } from "@/lib/clocked/types";
import type { KbScript } from "@/lib/kb/types";
import { scriptHarm } from "@/lib/text/harm";
import { pct, tracedCall } from "../trace";
import type { EvidenceMark, RunContext } from "../types";
import type { Passage } from "./retrieve";

/**
 * Stage 7, fix gate. When a kept article carries a remediation script,
 * Inspect reads it against this employee's approved scope before the Run fix
 * button may appear. FixProof never executes anything: Run fix shows a
 * simulated log. A benign verdict is not execution authorisation (Clocked
 * docs), so the button also needs the outcome policy to allow it.
 */

/** Below this suspicious score a benign script may be offered. */
export const SUSPICIOUS_MAX = 0.5;

export interface FixGateResult {
  ran: boolean;
  passageId: string | null;
  articleTitle: string | null;
  script: KbScript | null;
  verdict: string | null;
  malicious: number;
  suspicious: number;
  category: string | null;
  severity: string | null;
  evidence: { line: string; start: number; end: number }[];
  runAllowed: boolean;
}

export function scriptRequest(script: KbScript, persona: RunContext["persona"]): ScriptRequest {
  return {
    script: script.code,
    instructions: `${persona.approvedScope} The script would run as ${persona.name.split(" ")[0]}'s user on ${persona.device} (${persona.osLabel}). Anything outside the approved changes is out of scope.`,
    evidence: true,
  };
}

const NONE: FixGateResult = { ran: false, passageId: null, articleTitle: null, script: null, verdict: null, malicious: 0, suspicious: 0, category: null, severity: null, evidence: [], runAllowed: false };

export async function fixGate(ctx: RunContext, passages: Passage[]): Promise<FixGateResult> {
  const withScript = passages.find((p) => p.script);
  if (!withScript || !withScript.script) {
    ctx.emit({ id: "fixGate", stage: "fixGate", endpoint: "local", title: "Inspect", status: "skipped", effect: "No kept article includes a script, so there is nothing to run; the reply stands on its own." });
    return NONE;
  }
  const script = withScript.script;
  const { value } = await tracedCall(
    ctx,
    { id: "fixGate", stage: "fixGate", endpoint: "script", title: "Inspect, fix script", runningEffect: `Reading the ${script.lang} script from "${withScript.title}"` },
    () => ctx.client.script(scriptRequest(script, ctx.persona), { step: "fixGate" }),
    (res) => {
      const d = res.data;
      const runAllowed = d.verdict === "benign" && d.suspicious < SUSPICIOUS_MAX;
      const evidence = (d.evidence ?? []).map((e) => ({ line: e.line, start: e.start, end: e.end }));
      const marks: EvidenceMark[] = evidence.map((e) => ({ target: "script", ref: withScript.id, start: e.start, end: e.end, kind: "script", label: d.category }));
      return {
        value: { ran: true, passageId: withScript.id, articleTitle: withScript.title, script, verdict: d.verdict, malicious: d.malicious, suspicious: d.suspicious, category: d.category, severity: d.severity ?? null, evidence, runAllowed },
        summary: {
          count: evidence.length,
          countLabel: evidence.length === 1 ? "line flagged" : "lines flagged",
          verdict: d.verdict,
          probability: d.malicious,
          probabilityLabel: "malicious",
          effect: runAllowed
            ? `The ${script.lang} script stays inside ${ctx.persona.name.split(" ")[0]}'s approved scope (${pct(d.malicious)} malicious), so Run fix is offered.`
            : `The article's fix script was blocked: ${scriptHarm(d.category)}${evidence[0] ? ` (flagged line \`${evidence[0].line.trim()}\`, ${d.severity ?? "unrated"} severity)` : ""}. No Run fix button; a technician reviews it.`,
          evidence: marks,
          detail: { request: { script: script.code, instructions: scriptRequest(script, ctx.persona).instructions }, response: { verdict: d.verdict, malicious: d.malicious, suspicious: d.suspicious, category: d.category, categories: d.categories, severity: d.severity, evidence } },
        },
      };
    },
  );
  return value;
}
