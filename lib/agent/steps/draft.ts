import type { FillRequest } from "@/lib/clocked/types";
import { tracedCall } from "../trace";
import type { RunContext } from "../types";
import type { Passage } from "./retrieve";

/**
 * Stage 5, draft. Fill `generate` writes the reply from the kept passages
 * only. Clocked is the only model in FixProof: the draft is not trusted
 * until Verify has checked it sentence by sentence (stage 6).
 */

export const DRAFT_MAX_TOKENS = 220;

export function draftSource(ticket: string, passages: Passage[]): string {
  const sources = passages.map((p, i) => `[${i + 1}] ${p.title} · ${p.section} (updated ${p.updated})\n${p.text.replace(/```[\s\S]*?```/g, "[script omitted]")}`);
  return `Employee ticket:\n${ticket}\n\nKnowledge base sources:\n${sources.join("\n\n")}`;
}

export function draftRequest(ticket: string, passages: Passage[], persona: RunContext["persona"]): FillRequest {
  return {
    text: draftSource(ticket, passages),
    instructions:
      "You write replies for Northwind Labs' IT help desk. Use only the knowledge base sources. If the sources do not answer part of the ticket, say that plainly. Never invent times, dates, causes, approvals or links.",
    fields: {
      reply: {
        type: "generate",
        format: "text",
        max_tokens: DRAFT_MAX_TOKENS,
        description: `A reply to the employee (${persona.osLabel}, ${persona.office}) in plain English: one short opening sentence, then the steps to follow as short numbered sentences, taken only from the sources. No greeting line, no sign-off, no script code.`,
      },
    },
  };
}

export interface DraftResult {
  text: string;
  sources: Passage[];
}

export async function draft(ctx: RunContext, ticket: string, passages: Passage[]): Promise<DraftResult> {
  const { value } = await tracedCall(
    ctx,
    { id: "draft", stage: "draft", endpoint: "fill", title: "Fill, draft reply", runningEffect: `Writing a reply from ${passages.length} kept passages` },
    () => ctx.client.fill(draftRequest(ticket, passages, ctx.persona), { step: "draft" }),
    (res) => {
      const reply = res.data.fields.reply?.value;
      if (typeof reply !== "string" || !reply.trim()) throw new Error("Fill returned no reply text");
      const text = reply.trim();
      return {
        value: text,
        summary: {
          verdict: "drafted",
          effect: `Drafted from ${passages.map((p) => `"${p.title}"`).join(", ")}. Not shown to the employee until Verify checks every sentence.`,
          detail: { request: { sources: passages.map((p) => p.id), max_tokens: DRAFT_MAX_TOKENS }, response: { reply: text } },
        },
      };
    },
  );
  return { text: value, sources: passages };
}
