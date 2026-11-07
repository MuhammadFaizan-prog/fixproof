import type { DecideRequest, ExtractRequest, ExtractedField, FillRequest } from "@/lib/clocked/types";
import { KB_CATEGORIES } from "@/lib/kb/types";
import { decideBand, type Band, type DecideChoice } from "../policy";
import { pct, tracedCall } from "../trace";
import type { EvidenceMark, RunContext } from "../types";

/**
 * Stage 2, understand. Extract pulls exact values with offsets into the safe
 * text; Fill builds the typed ticket record; Decide sets the resolution
 * policy from the ticket plus that record. What changes downstream:
 * error codes and app names boost the KB query, the category steers recall,
 * severity sets the SLA badge, and the Decide band caps the outcome.
 */

export interface SpanValue {
  value: string;
  start?: number;
  end?: number;
  confidence?: number;
}

export interface UnderstandResult {
  extracted: {
    errorCodes: SpanValue[];
    assetTag: SpanValue | null;
    apps: SpanValue[];
    deadline: SpanValue | null;
    device: SpanValue | null;
  };
  record: {
    category: string | null;
    categoryConfidence: number;
    severity: string | null;
    severityProbabilities: Record<string, number>;
    affectedService: string | null;
    needsAdmin: boolean;
    needsAdminProbability: number;
  };
  policy: {
    choice: DecideChoice;
    probabilities: Partial<Record<DecideChoice, number>>;
    selfServiceSafe: number;
    band: Band;
    reason: string;
  };
}

export const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;

export function extractRequest(text: string): ExtractRequest {
  return {
    text,
    fields: {
      error_code: { description: "Error codes or exact error messages the employee reports, such as 809 or 'SSO authentication failed'", list: true, max_items: 4 },
      asset_tag: { description: "A Northwind Labs asset tag such as NW-MBP-0193 or NW-LT-2207", format: "code" },
      app_names: { description: "Applications, services or devices the employee names as affected", list: true, max_items: 5 },
      deadline: { description: "A time or deadline the employee mentions, such as 3pm or today" },
      device: { description: "The kind of computer or operating system the employee mentions, such as MacBook, Windows laptop or Ubuntu" },
    },
    instructions: "Return only values written in the ticket. Leave a field empty when the ticket does not state it. Placeholders like <PERSON> are masked personal data, not values.",
  };
}

export function fillRequest(text: string): FillRequest {
  return {
    text,
    fields: {
      category: { type: "choice", description: "The help-desk category of the main request", options: [...KB_CATEGORIES], allow_none: true },
      severity: { type: "score", description: "Impact on the employee's work", levels: [...SEVERITY_LEVELS] },
      affected_service: { type: "extract", description: "The service, application or device reported as not working", infer: false },
      needs_admin: { type: "yes_no", description: "Would doing what the employee asks require admin rights, a security exception or a group membership change?" },
    },
    instructions:
      "Severity rubric: low = routine question or request; medium = one person degraded with a workaround; high = one person blocked or a same-day deadline at risk; critical = a team or company-wide outage. Use only this ticket.",
  };
}

export function decideRequest(text: string, record: UnderstandResult["record"], persona: RunContext["persona"]): DecideRequest {
  return {
    state: { ticket: text, record: { category: record.category, severity: record.severity, needs_admin: record.needsAdmin }, employee: { os: persona.osLabel, role: persona.role } },
    instructions:
      "You set the resolution policy for Northwind Labs' Tier-0 IT help desk. It has a knowledge base of documented self-service fixes for common problems (VPN drops, print queues, mail and Outlook sync, MFA on a new phone, laptops not charging, Wi-Fi certificates, slow laptops, password resets) and can run pre-approved scripts. It cannot grant access or admin rights, change security controls, or repair physical damage. Urgency or a deadline alone is not a reason to escalate; it is a reason to resolve quickly.",
    questions: {
      policy: {
        type: "choice",
        instructions: "How should the help desk handle this ticket?",
        criteria: {
          auto_resolve: "A specific, common problem is described clearly enough that a documented self-service fix can be sent straight away.",
          suggest: "A documented fix may apply, but the description is vague or incomplete, so the employee should confirm before the ticket closes.",
          escalate: "Only a person can do it: granting access or admin rights, a security exception, a service outage affecting many people, visible physical damage such as a cracked screen or liquid spill, or a problem self-service cannot touch.",
        },
      },
      self_service_safe: {
        type: "noul",
        instructions: "Is it safe for the employee to apply a documented fix without a technician?",
        criteria: { true: "Following documented steps cannot harm the device, data or security posture.", false: "The request touches access, security controls or data, or could cause harm if done wrong." },
        threshold: 0.5,
      },
    },
  };
}

const span = (f: ExtractedField | undefined): SpanValue | null =>
  f && typeof f.value === "string" && f.value.trim() ? { value: f.value, start: f.start, end: f.end, confidence: f.confidence } : null;

const spans = (f: ExtractedField | undefined): SpanValue[] => {
  if (!f) return [];
  if (f.items?.length) return f.items.filter((i) => typeof i.value === "string" && i.value.trim()).map((i) => ({ value: i.value as string, start: i.start, end: i.end, confidence: i.confidence }));
  if (Array.isArray(f.value)) return f.value.filter((v) => v.trim()).map((value) => ({ value }));
  const one = span(f);
  return one ? [one] : [];
};

export async function understand(ctx: RunContext, text: string): Promise<UnderstandResult> {
  const extractCall = tracedCall(
    ctx,
    { id: "understand:extract", stage: "understand", endpoint: "extract", title: "Extract", runningEffect: "Pulling error codes, asset tags and deadlines" },
    () => ctx.client.extract(extractRequest(text), { step: "understand:extract" }),
    (res) => {
      const f = res.data.fields;
      const extracted: UnderstandResult["extracted"] = {
        errorCodes: spans(f.error_code),
        assetTag: span(f.asset_tag),
        apps: spans(f.app_names),
        deadline: span(f.deadline),
        device: span(f.device),
      };
      const all: [string, SpanValue][] = [
        ...extracted.errorCodes.map((v) => ["error" as const, v] as [string, SpanValue]),
        ...(extracted.assetTag ? [["asset" as const, extracted.assetTag] as [string, SpanValue]] : []),
        ...extracted.apps.map((v) => ["app", v] as [string, SpanValue]),
        ...(extracted.deadline ? [["deadline", extracted.deadline] as [string, SpanValue]] : []),
        ...(extracted.device ? [["device", extracted.device] as [string, SpanValue]] : []),
      ];
      const marks: EvidenceMark[] = all
        .filter(([, v]) => v.start !== undefined && v.end !== undefined)
        .map(([label, v]) => ({ target: "masked", start: v.start as number, end: v.end as number, kind: "extract", label }));
      const boost = [...extracted.errorCodes, ...extracted.apps].map((v) => v.value);
      const parts = [
        extracted.errorCodes.length ? `error ${extracted.errorCodes.map((v) => v.value).join(", ")}` : null,
        extracted.assetTag ? `asset ${extracted.assetTag.value}` : null,
        extracted.deadline ? `deadline ${extracted.deadline.value}` : null,
      ].filter(Boolean);
      return {
        value: extracted,
        summary: {
          count: all.length,
          countLabel: "values",
          verdict: all.length ? "found" : "none stated",
          effect: all.length
            ? `Pulled ${parts.join(", ") || all.map(([, v]) => v.value).join(", ")} with source offsets.${boost.length ? ` ${boost.join(", ")} boost the knowledge-base search.` : ""}${extracted.deadline ? " The deadline raises urgency." : ""}`
            : "The ticket states no error code, asset tag or deadline; the search uses its words only.",
          evidence: marks,
          detail: { request: { fields: Object.keys(extractRequest("").fields) }, response: res.data.fields },
        },
      };
    },
  );

  const fillCall = tracedCall(
    ctx,
    { id: "understand:fill", stage: "understand", endpoint: "fill", title: "Fill, ticket record", runningEffect: "Filling category, severity and admin need" },
    () => ctx.client.fill(fillRequest(text), { step: "understand:fill" }),
    (res) => {
      const f = res.data.fields;
      const category = typeof f.category?.value === "string" ? f.category.value : null;
      const severity = typeof f.severity?.value === "string" ? f.severity.value.toLowerCase() : null;
      const needsAdminP = f.needs_admin?.probabilities?.yes ?? (f.needs_admin?.value === true ? (f.needs_admin.confidence ?? 1) : 0);
      const record: UnderstandResult["record"] = {
        category,
        categoryConfidence: f.category?.probabilities && category ? (f.category.probabilities[category] ?? f.category.confidence ?? 0) : 0,
        severity,
        severityProbabilities: f.severity?.probabilities ?? {},
        affectedService: typeof f.affected_service?.value === "string" && f.affected_service.value ? f.affected_service.value : null,
        needsAdmin: f.needs_admin?.value === true,
        needsAdminProbability: needsAdminP,
      };
      return {
        value: record,
        summary: {
          verdict: category ?? "uncategorised",
          probability: record.categoryConfidence,
          probabilityLabel: "category",
          effect: `${category ? `Category ${category} (${pct(record.categoryConfidence)}) steers the search toward ${category} articles.` : "No category was clear, so the search is not steered."} Severity ${severity ?? "unknown"} sets the SLA.${record.needsAdmin ? " The request needs admin rights, which self-service cannot grant." : ""}`,
          detail: { request: { fields: Object.keys(fillRequest("").fields) }, response: res.data.fields },
        },
      };
    },
  );

  const [{ value: extracted }, { value: record }] = await Promise.all([extractCall, fillCall]);

  const { value: policy } = await tracedCall(
    ctx,
    { id: "understand:decide", stage: "understand", endpoint: "decide", title: "Decide, resolution policy", runningEffect: "Choosing auto-resolve, confirm or escalate" },
    () => ctx.client.decide(decideRequest(text, record, ctx.persona), { step: "understand:decide" }),
    (res) => {
      const a = res.data.answers;
      const pol = a.policy;
      const safe = a.self_service_safe;
      if (!pol || pol.type !== "choice") throw new Error("Decide returned no policy choice");
      const probabilities = pol.probabilities as Partial<Record<DecideChoice, number>>;
      const selfServiceSafe = safe && safe.type === "noul" ? safe.noul : 0;
      const { band, reason } = decideBand(probabilities, selfServiceSafe);
      const choice = pol.choice as DecideChoice;
      const bandText = { auto: "may auto-resolve", confirm: "will confirm with the employee before closing", escalate: "goes to a person" }[band];
      return {
        value: { choice, probabilities, selfServiceSafe, band, reason },
        summary: {
          verdict: choice,
          probability: probabilities[choice] ?? pol.confidence,
          probabilityLabel: choice,
          effect: `The ticket ${bandText}: ${reason}.`,
          detail: { request: { questions: ["policy (choice)", "self_service_safe (noul)"] }, response: res.data.answers },
        },
      };
    },
  );

  return { extracted, record, policy };
}
