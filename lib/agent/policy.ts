/**
 * Outcome policy. Pure functions only (no I/O) so every band is unit-tested.
 * Thresholds live here and nowhere else; a change to a band needs a test change.
 */

export type DecideChoice = "auto_resolve" | "suggest" | "escalate";
export type Band = "auto" | "confirm" | "escalate";

export const BANDS = {
  /** auto_resolve must be at least this likely for the auto band. */
  autoMin: 0.8,
  /** escalate at or above this sends the ticket to a person. Between the bands is a close call, which confirms. */
  escalateMin: 0.7,
  /** below this, the self-service-safe noul blocks the auto band. */
  selfServiceMin: 0.5,
} as const;

/** Map Decide's probabilities to a band. The middle of the distribution never auto-resolves. */
export function decideBand(probabilities: Partial<Record<DecideChoice, number>>, selfServiceSafe: number): { band: Band; reason: string } {
  const auto = probabilities.auto_resolve ?? 0;
  const esc = probabilities.escalate ?? 0;
  if (esc >= BANDS.escalateMin) return { band: "escalate", reason: `escalate is ${Math.round(esc * 100)}% likely` };
  if (auto >= BANDS.autoMin && selfServiceSafe >= BANDS.selfServiceMin) {
    return { band: "auto", reason: `auto_resolve is ${Math.round(auto * 100)}% likely and self-service is safe` };
  }
  if (auto >= BANDS.autoMin) return { band: "confirm", reason: `self-service safety is only ${Math.round(selfServiceSafe * 100)}%` };
  return { band: "confirm", reason: `auto_resolve is only ${Math.round(auto * 100)}% likely (needs ${Math.round(BANDS.autoMin * 100)}%)` };
}

/* ------------------------------------------------------------- outcome */

export type Outcome = "AUTO_RESOLVED" | "CONFIRM_WITH_USER" | "ESCALATED";

export const GROUNDED_AUTO = 0.7;
export const GROUNDED_MIN = 0.5;
export const ANSWERS_MIN = 0.5;

export type CheckId = "clocked" | "screen" | "policy" | "retrieval" | "sources" | "grounding" | "answers" | "script";

export interface Check {
  id: CheckId;
  label: string;
  /** true passed, false failed, null not applicable or not reached. */
  pass: boolean | null;
  detail: string;
  /** What a failure does to the outcome. */
  severity: "escalate" | "confirm";
}

/** How each check reads when it fails (used in headlines and the handoff). */
export const FAILED_AS: Record<CheckId, string> = {
  clocked: "a check did not complete",
  screen: "the ticket was held for injected instructions",
  policy: "Decide did not clear it for self-service",
  retrieval: "no documented fix applies",
  sources: "knowledge-base articles conflict",
  grounding: "the reply is not grounded in the sources",
  answers: "the reply may not answer the question",
  script: "the fix script is outside the approved scope",
};

export interface OutcomeInput {
  failure?: { step: string; kind: string } | null;
  screen?: { canContinue: boolean; quarantined: boolean } | null;
  band?: Band | null;
  bandReason?: string;
  retrievedCount?: number | null;
  unresolvedConflicts?: number | null;
  resolvedConflicts?: number | null;
  prove?: { grounded: number; answersQuestion: number | null; keptShare: number; removed: number; replyEmpty: boolean } | null;
  script?: { ran: boolean; verdict: string | null; runAllowed: boolean; category?: string | null; source?: string | null } | null;
}

export interface OutcomeDecision {
  outcome: Outcome;
  checks: Check[];
  /** The first failing check that set the outcome, or null for AUTO_RESOLVED. */
  deciding: Check | null;
  /** Whether the Run fix button may be shown. */
  runFix: boolean;
  headline: string;
}

/**
 * What a failed call means for the ticket, by ClockedError kind. A busy
 * service is worth retrying later; a refused key or exhausted credits is an
 * operator problem; an invalid request or response is a FixProof bug. Each
 * reads differently in the outcome and sets the handoff priority.
 */
export interface FailureMeaning {
  detail: string;
  /** Employee-facing next step. */
  next: string;
  priority: "P2" | "P3";
  retryable: boolean;
}

export function failureMeaning(kind: string): FailureMeaning {
  switch (kind) {
    case "rate_limited":
    case "server":
    case "timeout":
    case "network":
    case "ended":
      return { detail: "Clocked was busy or unreachable after retries", next: "A person picks it up now; FixProof can be re-run once Clocked answers.", priority: "P3", retryable: true };
    case "auth":
    case "credits":
    case "no_key":
      return { detail: "FixProof's Clocked access was refused (key or credits)", next: "A person picks it up; the help-desk owner is alerted to restore Clocked access.", priority: "P2", retryable: false };
    case "no_fixture":
      return { detail: "no recorded response exists for this step", next: "Run it live, or pick a preset that has a recording.", priority: "P3", retryable: false };
    case "invalid":
    case "too_large":
    case "invalid_response":
      return { detail: "Clocked could not read the request or FixProof could not read the answer", next: "A person picks it up; nothing was guessed.", priority: "P3", retryable: false };
    default:
      return { detail: "an internal error stopped the run", next: "A person picks it up; nothing was guessed.", priority: "P3", retryable: false };
  }
}

const two = (n: number) => `${Math.round(n * 100)}%`;

/** Combine every check into one outcome. Any escalate-level failure escalates; any confirm-level failure confirms. */
export function decideOutcome(i: OutcomeInput): OutcomeDecision {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  add({ id: "clocked", label: "Every check returned", severity: "escalate", pass: i.failure ? false : true, detail: i.failure ? `${failureMeaning(i.failure.kind).detail} at ${i.failure.step}` : "all Clocked calls answered" });

  if (i.screen) {
    add({
      id: "screen",
      label: "Ticket is safe to read",
      severity: "escalate",
      pass: i.screen.canContinue,
      detail: !i.screen.canContinue ? "injected instructions with nothing safe left" : i.screen.quarantined ? "injected sentence cut; the rest is clean" : "no injected instructions",
    });
  }
  if (i.band) {
    add({ id: "policy", label: "Policy allows self-service", severity: i.band === "escalate" ? "escalate" : "confirm", pass: i.band === "auto", detail: i.bandReason ?? i.band });
  }
  if (i.retrievedCount !== undefined && i.retrievedCount !== null) {
    add({ id: "retrieval", label: "A documented fix applies", severity: "escalate", pass: i.retrievedCount > 0, detail: i.retrievedCount > 0 ? `${i.retrievedCount} passage${i.retrievedCount === 1 ? "" : "s"} kept for this employee` : "no knowledge-base passage applies" });
  }
  if (i.unresolvedConflicts !== undefined && i.unresolvedConflicts !== null) {
    add({
      id: "sources",
      label: "Sources agree",
      severity: "escalate",
      pass: i.unresolvedConflicts === 0,
      detail: i.unresolvedConflicts ? `${i.unresolvedConflicts} conflict with no newer source` : i.resolvedConflicts ? "conflict resolved for the newer article" : "no conflicts",
    });
  }
  if (i.prove) {
    const g = i.prove.grounded;
    add({
      id: "grounding",
      label: "Reply is grounded",
      severity: g < GROUNDED_MIN || i.prove.replyEmpty ? "escalate" : "confirm",
      pass: !i.prove.replyEmpty && g >= GROUNDED_AUTO,
      detail: i.prove.replyEmpty ? "no sentence survived Verify" : `grounded ${two(g)}${i.prove.removed ? `, ${i.prove.removed} sentence${i.prove.removed === 1 ? "" : "s"} removed` : ""}`,
    });
    if (i.prove.answersQuestion !== null) {
      add({ id: "answers", label: "Reply answers the ticket", severity: "confirm", pass: i.prove.answersQuestion >= ANSWERS_MIN, detail: `answers the question ${two(i.prove.answersQuestion)}` });
    }
  }
  if (i.script?.ran) {
    const malicious = i.script.verdict === "malicious";
    add({
      id: "script",
      label: "Fix script is in scope",
      severity: malicious ? "escalate" : "confirm",
      pass: i.script.runAllowed,
      detail: `${i.script.source ? `script in "${i.script.source}" ` : ""}${i.script.runAllowed ? "is benign for this device" : `is ${i.script.verdict}${i.script.category ? `: ${i.script.category}` : ""}`}`,
    });
  }

  const failed = checks.filter((c) => c.pass === false);
  const esc = failed.find((c) => c.severity === "escalate");
  const conf = failed.find((c) => c.severity === "confirm");
  const outcome: Outcome = esc ? "ESCALATED" : conf ? "CONFIRM_WITH_USER" : "AUTO_RESOLVED";
  const deciding = esc ?? conf ?? null;
  const runFix = outcome !== "ESCALATED" && Boolean(i.script?.ran && i.script.runAllowed);
  const passed = checks.filter((c) => c.pass === true).length;
  const headline =
    outcome === "AUTO_RESOLVED"
      ? `${checks.length} checks passed. Resolved without a technician.`
      : outcome === "CONFIRM_WITH_USER"
        ? `${passed} of ${checks.length} checks passed. Confirm before closing: ${FAILED_AS[deciding!.id]} (${deciding!.detail}).`
        : `Handed to a person: ${FAILED_AS[deciding!.id]} (${deciding!.detail}).`;
  return { outcome, checks, deciding, runFix, headline };
}
