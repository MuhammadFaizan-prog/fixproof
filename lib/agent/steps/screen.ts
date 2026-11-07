import type { InjectionEvidence, InjectionResponse, PiiEntity, PiiResponse, PipelineRequest } from "@/lib/clocked/types";
import { cpSlice, removeSpans, rewrite } from "@/lib/text/offsets";
import { pct, plural, tracedCall } from "../trace";
import type { EvidenceMark, RunContext } from "../types";

/**
 * Stage 1, screen. One Pipeline round trip runs Protect (PII) and Guard
 * (injection, stop on flag) over the ticket exactly as typed. Both report
 * offsets into that same text, so FixProof builds the text every later step
 * reads itself: PII spans become <TYPE> placeholders and injected spans are
 * cut out. When Guard flagged something, the remainder is checked again
 * before anything is allowed to read it.
 */

export const PII_ENTITIES = {
  person: null,
  email: null,
  phone: null,
  address: null,
  ip_address: null,
  employee_id: "Northwind Labs employee IDs, such as E-20417",
} as const;

export interface ScreenResult {
  originalText: string;
  /** PII replaced and injected spans removed. Every later step reads only this. */
  safeText: string;
  pii: PiiEntity[];
  piiCounts: Record<string, number>;
  injection: {
    verdict: string;
    score: number;
    category: string;
    severity: string | null;
    evidence: InjectionEvidence[];
    residual: number | null;
  };
  quarantined: boolean;
  /** Result of Guard on the remainder, when the ticket was quarantined. */
  recheck: { verdict: string; score: number } | null;
  /** false when nothing safe is left to work on (all injection, or the remainder is still flagged). */
  canContinue: boolean;
  marks: EvidenceMark[];
}

function placeholder(type: string) {
  return `<${type.toUpperCase()}>`;
}

/** Pipeline step results arrive untyped; check the endpoint and status before trusting them. */
function stepResult<T>(steps: { endpoint: string; status: number | null; result?: unknown }[], endpoint: string): T | null {
  const s = steps.find((x) => x.endpoint === endpoint);
  if (!s || s.status !== 200 || !s.result || typeof s.result !== "object") return null;
  return s.result as T;
}

export function screenRequest(text: string): PipelineRequest {
  return {
    text,
    steps: [
      { pii: { entities: { ...PII_ENTITIES }, anonymize: "replace" }, name: "protect" },
      { injection: { source: "user", evidence: true }, stop: true, name: "guard" },
    ],
  };
}

export async function screen(ctx: RunContext, text: string): Promise<ScreenResult> {
  const { value: first } = await tracedCall(
    ctx,
    { id: "screen", stage: "screen", endpoint: "pipeline", title: "Protect + Guard", runningEffect: "Masking personal data and checking for injected instructions" },
    () => ctx.client.pipeline(screenRequest(text), { step: "screen" }),
    (res) => {
      const pii = stepResult<PiiResponse>(res.data.steps, "pii");
      const inj = stepResult<InjectionResponse>(res.data.steps, "injection");
      if (!pii || !inj) {
        throw new Error("Pipeline screening returned without both Protect and Guard results");
      }
      const flagged = inj.verdict !== "benign";
      const evidence = flagged ? (inj.evidence ?? []) : [];
      const marks: EvidenceMark[] = [
        ...pii.entities.map((e) => ({ target: "original" as const, start: e.start, end: e.end, kind: "pii" as const, label: e.type })),
        ...evidence.map((e) => ({ target: "original" as const, start: e.start, end: e.end, kind: "injection" as const, label: inj.category })),
      ];
      const kinds = Object.keys(pii.counts);
      const masked = pii.entities.length
        ? `Masked ${plural(pii.entities.length, "personal detail")} (${kinds.join(", ")}) before any other step reads the ticket.`
        : "No personal data found to mask.";
      const guard = flagged
        ? ` Guard flagged ${plural(evidence.length, "injected sentence")} as ${inj.category} (${inj.severity ?? "unrated"}); ${evidence.length ? "cut out by offset" : "no span returned, so the whole ticket is held"}.`
        : " Guard found no injected instructions.";
      return {
        value: { pii, inj, flagged, evidence, marks },
        summary: {
          count: pii.entities.length,
          countLabel: "masked",
          verdict: flagged ? "quarantined" : "clean",
          probability: inj.injection,
          probabilityLabel: "injection",
          effect: masked + guard,
          evidence: marks,
          detail: {
            request: { steps: ["pii (anonymize: replace)", "injection (source: user, stop: true)"], text: "[the ticket as typed; not echoed]" },
            response: { pii: { counts: pii.counts, anonymized_text: pii.anonymized_text }, injection: { verdict: inj.verdict, injection: inj.injection, category: inj.category, severity: inj.severity, evidence: evidence.map((e) => ({ quote: e.quote, start: e.start, end: e.end })), residual: inj.residual } },
          },
        },
      };
    },
  );

  const { pii, inj, flagged, evidence, marks } = first;
  const replace = pii.entities.map((e) => ({ start: e.start, end: e.end, replacement: placeholder(e.type) }));
  const remove = evidence.map((e) => ({ start: e.start, end: e.end }));
  // Flagged with no span: hold the whole ticket rather than guess which part is safe.
  const safeText = flagged && evidence.length === 0 ? "" : rewrite(text, { remove, replace });

  const result: ScreenResult = {
    originalText: text,
    safeText,
    pii: pii.entities,
    piiCounts: pii.counts,
    injection: { verdict: inj.verdict, score: inj.injection, category: inj.category, severity: inj.severity ?? null, evidence, residual: inj.residual ?? null },
    quarantined: flagged,
    recheck: null,
    canContinue: !flagged,
    marks,
  };

  if (!flagged) return result;

  if (!safeText.trim()) {
    ctx.emit({
      id: "screen:remainder",
      stage: "screen",
      endpoint: "local",
      title: "Safe remainder",
      status: "skipped",
      count: 0,
      countLabel: "left",
      effect: "Nothing is left once the injected text is removed, so there is no request to solve.",
    });
    return result;
  }

  const { value: recheck } = await tracedCall(
    ctx,
    { id: "screen:recheck", stage: "screen", endpoint: "injection", title: "Guard, remainder", runningEffect: "Re-checking what is left after the cut" },
    () => ctx.client.injection({ text: safeText, source: "user", evidence: true }, { step: "screen:recheck" }),
    (res) => {
      const ok = res.data.verdict === "benign";
      const kept = cpSlice(safeText, 0, 80);
      return {
        value: { verdict: res.data.verdict, score: res.data.injection },
        summary: {
          verdict: ok ? "benign" : res.data.verdict,
          probability: res.data.injection,
          probabilityLabel: "injection",
          effect: ok
            ? `The remainder is clean (${pct(res.data.injection)} injection), so FixProof continues with it: "${kept}${safeText.length > 80 ? "…" : ""}"`
            : `The remainder is still flagged (${res.data.category}), so the ticket goes to a person.`,
          detail: { request: { text: safeText, source: "user" }, response: { verdict: res.data.verdict, injection: res.data.injection, category: res.data.category } },
        },
      };
    },
  );
  result.recheck = recheck;
  result.canContinue = recheck.verdict === "benign";
  return result;
}

/** Convenience for the UI and tests: the text as typed, minus the injected spans only. */
export function withoutInjection(result: ScreenResult): string {
  return removeSpans(result.originalText, result.injection.evidence);
}
