import { scriptHarm } from "@/lib/text/harm";

export { scriptHarm };
/**
 * Employee-facing words for Clocked's verdict values, so no API enum
 * (snake_case) ever reaches the screen. tests/plain-language.test.ts and the
 * copy-lint e2e keep it that way.
 */

const VERDICT: Record<string, string> = {
  supported: "Backed by the KB",
  not_a_claim: "Framing",
  not_stated: "Not in the KB",
  contradicted: "Contradicts the KB",
};
export const verdictWord = (v: string) => VERDICT[v] ?? humanize(v);

const SKIP: Record<string, string> = {
  different_case: "written for a different OS or setup",
  unrelated: "not about this problem",
  elsewhere: "answered in another passage",
  below_top_n: "not read closely (ranked too low)",
};
export const skipReason = (r: string) => SKIP[r] ?? humanize(r);

/** "instruction override" stays; "same_date" → "same date". Any enum left over reads as words. */
export function humanize(s: string): string {
  return s.replace(/_/g, " ");
}

/** ≥90% very likely, 70–90% likely, below 70% unsure (one map, used everywhere). */
export function confidenceWord(p: number): "very likely" | "likely" | "unsure" {
  return p >= 0.9 ? "very likely" : p >= 0.7 ? "likely" : "unsure";
}

export const LOW_CONFIDENCE = 0.7;

/** "Security (52%)" becomes "Likely Security, low confidence (52%): please confirm. Runner-up: End-user Computing (41%)." */
export function routingLine(team: string, p: number | null | undefined, runnerUp?: { team: string; confidence: number } | null): { text: string; low: boolean } {
  if (p == null) return { text: team, low: false };
  const pc = Math.round(p * 100);
  if (p >= LOW_CONFIDENCE) return { text: `${team} (${pc}%)`, low: false };
  return { text: `Likely ${team}, low confidence (${pc}%): please confirm.${runnerUp ? ` Runner-up: ${runnerUp.team} (${Math.round(runnerUp.confidence * 100)}%).` : ""}`, low: true };
}

interface WhyInput {
  understand?: { policy: { probabilities: Partial<Record<string, number>>; selfServiceSafe: number; band: string } } | null;
  fixGate?: { category: string | null } | null;
}

const pc = (p: number | undefined) => `${Math.round((p ?? 0) * 100)}%`;

/** Why the run stopped short of resolving, in words an employee or a non-developer reads once. */
export function plainWhy(c: { id: string; detail: string }, r: WhyInput): string {
  switch (c.id) {
    case "script":
      return `the article's fix script was blocked: ${scriptHarm(r.fixGate?.category)}`;
    case "policy": {
      const p = r.understand?.policy;
      if (!p) return "Decide did not clear it for self-service";
      if (p.band === "escalate") return `Decide rates it as a job for a person (${pc(p.probabilities.escalate)} likely)`;
      if ((p.probabilities.auto_resolve ?? 0) >= 0.8) return `Decide is unsure it is safe to fix alone (${pc(p.selfServiceSafe)} safe, needs 50%)`;
      return `Decide is only ${pc(p.probabilities.auto_resolve)} sure it can be fixed without a person (needs 80%)`;
    }
    case "screen":
      return "the ticket tried to give the help desk instructions and nothing safe was left";
    case "retrieval":
      return "no help article applies to this employee's setup";
    case "sources":
      return "two help articles disagree and neither one is newer";
    case "grounding":
      return /survived/.test(c.detail) ? "no sentence of the draft is backed by the knowledge base" : "the reply is not backed strongly enough by the knowledge base";
    case "answers":
      return "the reply may not answer the question";
    case "clocked":
      return "a Clocked check did not answer, so a person takes over";
    default:
      return humanize(c.detail);
  }
}

const ENUM_WORDS: Record<string, string> = {
  auto_resolve: "auto-resolve",
  self_service_safe: "self-service safe",
  different_case: "written for a different OS or setup",
  not_stated: "not in the KB",
  not_a_claim: "framing",
  below_top_n: "ranked too low",
  already_given: "already given",
  AUTO_RESOLVED: "Resolved",
  CONFIRM_WITH_USER: "Needs confirmation",
  ESCALATED: "Handed to a person",
};

/** Any text built from Clocked or policy values, made readable: known enums become words, any other snake_case loses its underscores. */
export function plainText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\b(AUTO_RESOLVED|CONFIRM_WITH_USER|ESCALATED|auto_resolve|self_service_safe|different_case|not_stated|not_a_claim|below_top_n|already_given)\b/g, (m) => ENUM_WORDS[m])
    .replace(/\b([a-z]+)_([a-z][a-z_]*)\b/g, (m) => m.replace(/_/g, " "));
}
