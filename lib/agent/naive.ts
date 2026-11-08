import type { ClaimVerdict } from "@/lib/clocked/types";
import type { KbIndex } from "@/lib/kb/index";
import { splitSentences } from "@/lib/text/sentences";
import type { Persona } from "@/data/personas";
import type { ClockedClient } from "@/lib/clocked/client";
import type { Passage } from "./steps/retrieve";

/**
 * The "unchecked desk" baseline, used only by the eval (scripts/eval.ts) to
 * show what FixProof's checks change. It is NOT FixProof: a naive Tier-0 bot
 * that takes the ticket as typed (no screening), the top 3 BM25 passages (no
 * Rerank, no Guard, no Compare), shows any script in them as-is, and ships one
 * Fill draft. Then Verify, the same judge FixProof uses, scores that draft
 * against the passages FixProof kept for the same ticket. Two Clocked calls.
 */

export const NAIVE_TOP_K = 3;

export interface NaiveResult {
  sources: { id: string; articleId: string; title: string; section: string; hasScript: boolean }[];
  /** The script the naive bot would have shown, verbatim (first one in its sources). */
  script: { articleId: string; lang: string; code: string } | null;
  reply: string;
  /** Verify's verdict per sentence, judged against FixProof's kept passages. Null when FixProof kept none (nothing to judge against). */
  claims: { text: string; verdict: ClaimVerdict | string; supported: number }[] | null;
  grounded: number | null;
  credits: number;
}

export function naiveSources(index: KbIndex, rawTicket: string) {
  return index.search(rawTicket, { limit: NAIVE_TOP_K }).map((h) => h.chunk);
}

export async function runNaive(client: ClockedClient, persona: Persona, index: KbIndex, rawTicket: string, judgeWith: Pick<Passage, "id" | "text">[]): Promise<NaiveResult> {
  const chunks = naiveSources(index, rawTicket);
  const withScript = chunks.find((c) => c.script);
  let credits = 0;
  const source = chunks.map((c, i) => `[${i + 1}] ${c.title} · ${c.section}\n${c.text}${c.script && !c.text.includes(c.script.code) ? `\n\`\`\`${c.script.lang}\n${c.script.code}\n\`\`\`` : ""}`).join("\n\n");
  const draft = await client.fill(
    {
      text: `Employee ticket:\n${rawTicket}\n\nKnowledge base:\n${source}`,
      instructions: "You are an IT help-desk bot. Answer the employee's ticket using the knowledge base.",
      fields: { reply: { type: "generate", format: "text", max_tokens: 220, description: `A reply to ${persona.name.split(" ")[0]}: one opening sentence, then numbered steps. Include any script from the knowledge base that helps.` } },
    },
    { step: "naive:draft" },
  );
  credits += draft.meta.credits ?? 0;
  const reply = typeof draft.data.fields.reply?.value === "string" ? draft.data.fields.reply.value.trim() : "";
  let claims: NaiveResult["claims"] = null;
  let grounded: number | null = null;
  const sentences = splitSentences(reply);
  if (judgeWith.length && sentences.length) {
    const v = await client.grounding(
      {
        question: rawTicket,
        answer: reply,
        claims: sentences,
        documents: judgeWith.map((p) => ({ id: p.id, text: p.text })),
        evidence: "all",
        threshold: 0.5,
        instructions: "These are the IT knowledge-base passages that apply to this employee. A step, time, date, cause or promise is supported only if a passage states it.",
      },
      { step: "naive:verify" },
    );
    credits += v.meta.credits ?? 0;
    grounded = v.data.grounded;
    claims = sentences.map((text, i) => {
      const c = v.data.claims[i]?.claim.trim() === text.trim() ? v.data.claims[i] : v.data.claims.find((x) => x.claim.trim() === text.trim());
      return { text, verdict: c?.verdict ?? "not_stated", supported: c?.supported ?? 0 };
    });
  }
  return {
    sources: chunks.map((c) => ({ id: c.id, articleId: c.articleId, title: c.title, section: c.section, hasScript: Boolean(c.script) })),
    script: withScript?.script ? { articleId: withScript.articleId, lang: withScript.script.lang, code: withScript.script.code } : null,
    reply,
    claims,
    grounded,
    credits,
  };
}
