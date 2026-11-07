import type { FillRequest } from "@/lib/clocked/types";
import { FAILED_AS, failureMeaning, type Check } from "../policy";
import { tracedCall } from "../trace";
import type { RunContext } from "../types";

/**
 * Stage 8, handoff. When the outcome is ESCALATED, Fill turns what the run
 * learned into the record a technician picks up: a summary, the team that
 * should own it and a priority. Values FixProof already knows for certain
 * (which check failed, what was tried, the masked ticket) are filled in
 * locally, not asked of the model. If Clocked itself is down, the same
 * record is built locally so the ticket is never lost.
 */

export const ASSIGNMENT_GROUPS = ["Service Desk", "Network Operations", "Identity & Access", "Security", "End-user Computing"] as const;
export const PRIORITIES = ["P4", "P3", "P2", "P1"] as const;

export interface HandoffRecord {
  source: "fill" | "local";
  summary: string;
  assignmentGroup: string;
  assignmentConfidence: number | null;
  priority: string;
  failedCheck: { id: string; label: string; detail: string } | null;
  attempted: string[];
  maskedTicket: string;
  employee: { name: string; device: string; assetTag: string; office: string };
}

export interface HandoffInput {
  maskedTicket: string;
  failed: Check | null;
  attempted: string[];
  /** The verified reply already shown to the employee, if any. */
  reply: string | null;
}

export function handoffSource(i: HandoffInput, persona: RunContext["persona"]): string {
  return [
    `Ticket (personal data masked):\n${i.maskedTicket || "[nothing safe to show]"}`,
    `Employee: ${persona.role}, ${persona.department}, ${persona.office}; ${persona.device} (${persona.osLabel}).`,
    `Why FixProof stopped: ${i.failed ? `${FAILED_AS[i.failed.id]} (${i.failed.detail})` : "not stated"}.`,
    `What FixProof already did: ${i.attempted.join("; ") || "nothing"}.`,
    i.reply ? `Verified holding reply sent to the employee:\n${i.reply}` : "No reply was sent to the employee.",
  ].join("\n\n");
}

export function handoffRequest(i: HandoffInput, persona: RunContext["persona"]): FillRequest {
  return {
    text: handoffSource(i, persona),
    instructions: "You prepare escalations for a human IT technician. Use only the text. Do not suggest causes or fixes that are not stated.",
    fields: {
      summary: { type: "generate", format: "text", max_tokens: 90, description: "Two sentences for the technician: the employee's problem and why the automated desk stopped." },
      assignment_group: { type: "choice", options: [...ASSIGNMENT_GROUPS], description: "Which team should own this ticket" },
      priority: { type: "score", levels: [...PRIORITIES], description: "P1 = security risk or many people blocked; P2 = one person blocked against a deadline; P3 = degraded; P4 = routine request" },
    },
  };
}

function base(i: HandoffInput, persona: RunContext["persona"]): Omit<HandoffRecord, "source" | "summary" | "assignmentGroup" | "assignmentConfidence" | "priority"> {
  return {
    failedCheck: i.failed ? { id: i.failed.id, label: i.failed.label, detail: i.failed.detail } : null,
    attempted: i.attempted,
    maskedTicket: i.maskedTicket,
    employee: { name: persona.name, device: persona.device, assetTag: persona.assetTag, office: persona.office },
  };
}

/** The record built without Clocked, used when Clocked is the thing that failed. */
export function localHandoff(i: HandoffInput, persona: RunContext["persona"], failureKind?: string): HandoffRecord {
  const meaning = failureKind ? failureMeaning(failureKind) : null;
  return {
    ...base(i, persona),
    source: "local",
    summary: `Automated triage stopped${i.failed ? `: ${FAILED_AS[i.failed.id]} (${i.failed.detail})` : ""}. ${meaning ? meaning.next : "The ticket is queued for the Service Desk with everything FixProof had done so far."}`,
    assignmentGroup: "Service Desk",
    assignmentConfidence: null,
    priority: meaning?.priority ?? "P3",
  };
}

export async function handoff(ctx: RunContext, i: HandoffInput): Promise<HandoffRecord> {
  const { value } = await tracedCall(
    ctx,
    { id: "handoff", stage: "outcome", endpoint: "fill", title: "Fill, handoff record", runningEffect: "Writing the record a technician will pick up" },
    () => ctx.client.fill(handoffRequest(i, ctx.persona), { step: "handoff" }),
    (res) => {
      const f = res.data.fields;
      const summary = typeof f.summary?.value === "string" && f.summary.value.trim() ? f.summary.value.trim() : localHandoff(i, ctx.persona).summary;
      const group = typeof f.assignment_group?.value === "string" ? f.assignment_group.value : "Service Desk";
      const priority = typeof f.priority?.value === "string" ? f.priority.value : "P3";
      const record: HandoffRecord = {
        ...base(i, ctx.persona),
        source: "fill",
        summary,
        assignmentGroup: group,
        assignmentConfidence: f.assignment_group?.probabilities?.[group] ?? f.assignment_group?.confidence ?? null,
        priority,
      };
      return {
        value: record,
        summary: {
          verdict: `${group} · ${priority}`,
          probability: record.assignmentConfidence ?? undefined,
          probabilityLabel: "routing",
          effect: `Routed to ${group} at ${priority} with the masked ticket, the failed check and ${i.attempted.length} step${i.attempted.length === 1 ? "" : "s"} already tried, so nobody asks the employee again.`,
          detail: { request: { fields: ["summary (generate)", "assignment_group (choice)", "priority (score)"] }, response: res.data.fields },
        },
      };
    },
  );
  return value;
}
