import type { KbChunk, KbScript } from "@/lib/kb/types";
import type { KbIndex } from "@/lib/kb/index";
import type { RerankAction, RerankReason, RerankRequest, RerankResult } from "@/lib/clocked/types";
import { localStep, pct, plural, tracedCall } from "../trace";
import type { RunContext } from "../types";
import type { UnderstandResult } from "./understand";

/**
 * Stage 3, retrieve. Cheap lexical recall (BM25, top 20) then Clocked
 * judgment: Rerank reads every passage with the employee as context and
 * returns use / expand / skip. `expand` passages are widened to their
 * neighbouring sections and reranked once more. Every passage that will be
 * used is screened by Guard (source: content) and dropped if it carries
 * instructions aimed at the assistant. Only what survives reaches drafting.
 */

export const RECALL_LIMIT = 20;
export const MAX_EXPAND = 3;
export const MAX_USE = 4;

export interface Passage {
  /** "<article>#<i>" or "<article>#<i>-<j>" for a widened passage. */
  id: string;
  articleId: string;
  title: string;
  section: string;
  text: string;
  updated: string;
  os: KbChunk["os"];
  region: KbChunk["region"];
  script: KbScript | null;
  relevance: number;
  widened: boolean;
  /** The KB chunks this passage is made of, in article order. */
  chunkIds: string[];
  /** Why it is here when Rerank did not pick it itself. */
  pulledBy?: "supersedes";
}

export interface SkippedPassage {
  id: string;
  title: string;
  section: string;
  reason: RerankReason | "below_top_n" | "poisoned";
  relevance: number;
  detail?: string;
}

export interface RetrieveResult {
  query: string;
  recalled: number;
  used: Passage[];
  skipped: SkippedPassage[];
  dropped: SkippedPassage[];
}

/** BM25 query: the safe text without placeholders, plus the exact values Extract and Fill found. */
export function buildQuery(text: string, u: UnderstandResult): string {
  const extras = [...u.extracted.errorCodes, ...u.extracted.apps].map((v) => v.value);
  if (u.extracted.device) extras.push(u.extracted.device.value);
  if (u.record.affectedService) extras.push(u.record.affectedService);
  return [text.replace(/<[A-Z_]+>/g, " "), ...extras].join(" ").replace(/\s+/g, " ").trim();
}

function fromChunk(c: KbChunk, relevance = 0): Passage {
  return { id: c.id, articleId: c.articleId, title: c.title, section: c.section, text: c.text, updated: c.updated, os: c.os, region: c.region, script: c.script, relevance, widened: false, chunkIds: [c.id] };
}

/** Join a chunk with its neighbours, in article order, as one passage. */
export function widen(index: KbIndex, chunkId: string): Passage | null {
  const chunk = index.get(chunkId);
  if (!chunk) return null;
  const group = [chunk, ...index.neighbors(chunkId, 1)].sort((a, b) => a.index - b.index);
  if (group.length === 1) return null;
  const first = group[0].index;
  const last = group[group.length - 1].index;
  return {
    ...fromChunk(chunk),
    id: `${chunk.articleId}#${first}-${last}`,
    section: group.map((c) => c.section).join(" + "),
    text: group.map((c) => c.text).join("\n\n"),
    script: group.find((c) => c.script)?.script ?? null,
    widened: true,
    chunkIds: group.map((c) => c.id),
  };
}

export function rerankRequest(query: string, passages: Passage[], persona: RunContext["persona"]): RerankRequest {
  return {
    query,
    documents: passages.map((p) => ({
      id: p.id,
      title: `${p.title} · ${p.section}`,
      text: p.text,
      metadata: { os: p.os.join(", "), region: p.region.join(", "), updated: p.updated },
    })),
    context: { employee: { role: persona.role, os: persona.osLabel, device: persona.device, office: persona.office, region: persona.region.toUpperCase() } },
    instructions:
      "Judge each passage for this employee. A passage written for a different operating system or region than the employee's is a different case, even when the words match. Policy passages that govern the request count as answers.",
  };
}

const REASON_TEXT: Record<string, string> = {
  different_case: "written for a different case",
  unrelated: "unrelated",
  already_given: "already given",
  below_top_n: "not returned",
  poisoned: "carries instructions aimed at the assistant",
};

function describeSkips(skipped: SkippedPassage[]): string {
  const dc = skipped.filter((s) => s.reason === "different_case");
  if (dc.length) return ` Skipped "${dc[0].title}" as different_case${dc.length > 1 ? ` (+${dc.length - 1} more)` : ""}.`;
  return skipped.length ? ` Skipped ${plural(skipped.length, "passage")} as unrelated.` : "";
}

export async function retrieve(ctx: RunContext, index: KbIndex, text: string, u: UnderstandResult): Promise<RetrieveResult> {
  const query = buildQuery(text, u);
  const boostCategory = u.record.category && u.record.categoryConfidence >= 0.6 ? u.record.category : null;
  const hits = index.search(query, { limit: RECALL_LIMIT, boostCategory });
  const articles = new Set(hits.map((h) => h.chunk.articleId));
  localStep(ctx, { id: "retrieve:recall", stage: "retrieve", title: "BM25 recall" }, {
    count: hits.length,
    countLabel: "recalled",
    effect: hits.length
      ? `Recalled ${plural(hits.length, "passage")} from ${plural(articles.size, "article")}${boostCategory ? `, ${boostCategory} articles boosted` : ""}. Rerank decides which apply.`
      : "No knowledge-base passage shares words with this ticket.",
    detail: { request: { query, boostCategory }, response: hits.map((h) => ({ id: h.chunk.id, score: Number(h.score.toFixed(2)) })) },
  });
  const result: RetrieveResult = { query, recalled: hits.length, used: [], skipped: [], dropped: [] };
  if (!hits.length) return result;

  const candidates = hits.map((h) => fromChunk(h.chunk));
  const rerankQuery = text.replace(/<[A-Z_]+>/g, "someone");

  const { value: first } = await tracedCall(
    ctx,
    { id: "retrieve:rerank", stage: "retrieve", endpoint: "rerank", title: "Rerank", runningEffect: `Reading ${candidates.length} passages for ${ctx.persona.osLabel}` },
    () => ctx.client.rerank(rerankRequest(rerankQuery, candidates, ctx.persona), { step: "retrieve:rerank" }),
    (res) => {
      const classified = classify(res.data.results, candidates);
      return {
        value: classified,
        summary: {
          count: classified.use.length,
          countLabel: "kept",
          verdict: classified.use.length ? "use" : classified.expand.length ? "expand" : "none apply",
          probability: classified.use[0]?.relevance ?? classified.expand[0]?.relevance ?? 0,
          probabilityLabel: "top relevance",
          effect: `Kept ${plural(classified.use.length, "passage")} of ${candidates.length}${classified.expand.length ? `, ${classified.expand.length} to widen` : ""}.${describeSkips(classified.skipped)}`,
          detail: { request: { query: rerankQuery, context: rerankRequest(rerankQuery, [], ctx.persona).context, documents: candidates.length }, response: res.data.results.map(slimResult) },
        },
      };
    },
  );

  let used = first.use;
  result.skipped = first.skipped;

  const toWiden = first.expand.slice(0, MAX_EXPAND).map((p) => widen(index, p.id)).filter((p): p is Passage => p !== null);
  if (toWiden.length) {
    const { value: second } = await tracedCall(
      ctx,
      { id: "retrieve:expand", stage: "retrieve", endpoint: "rerank", title: "Rerank, widened", runningEffect: "Re-reading widened passages" },
      () => ctx.client.rerank(rerankRequest(rerankQuery, toWiden, ctx.persona), { step: "retrieve:expand" }),
      (res) => {
        const c = classify(res.data.results, toWiden);
        return {
          value: c,
          summary: {
            count: c.use.length,
            countLabel: "kept",
            verdict: c.use.length ? "use" : "skip",
            probability: c.use[0]?.relevance ?? 0,
            probabilityLabel: "top relevance",
            effect: c.use.length
              ? `Widening to neighbouring sections made ${plural(c.use.length, "passage")} complete enough to use.`
              : "Widened passages still did not answer the ticket, so they stay out.",
            detail: { request: { documents: toWiden.map((p) => p.id) }, response: res.data.results.map(slimResult) },
          },
        };
      },
    );
    // A widened passage replaces any narrower one from the same article it covers.
    const widenedArticles = new Set(second.use.map((p) => p.articleId));
    used = [...used.filter((p) => !widenedArticles.has(p.articleId)), ...second.use];
    result.skipped.push(...second.skipped, ...second.expand.map((p) => ({ id: p.id, title: p.title, section: p.section, reason: "unrelated" as const, relevance: p.relevance, detail: "still incomplete after widening" })));
  }

  used = pullNewerVersions(index, used);
  used = mergeByArticle(index, used).slice(0, MAX_USE);

  // Guard every KB section that will reach the draft, once each. A poisoned
  // section is cut out of its passage; the rest of the article stays usable.
  const poisoned = new Map<string, { category: string; quote?: string }>();
  const chunkIds = [...new Set(used.flatMap((p) => p.chunkIds))];
  for (const chunkId of chunkIds) {
    const chunk = index.get(chunkId);
    if (!chunk) continue;
    const id = `retrieve:guard:${chunkId}`;
    const { value: verdict } = await tracedCall(
      ctx,
      { id, stage: "retrieve", endpoint: "injection", title: `Guard, ${chunk.section}`, runningEffect: "Checking the passage for instructions aimed at the assistant" },
      () => ctx.client.injection({ text: chunk.text, source: "content", evidence: true }, { step: id }),
      (res) => {
        const flagged = res.data.verdict !== "benign";
        const quote = [...(res.data.evidence ?? [])].sort((a, b) => b.quote.length - a.quote.length)[0]?.quote;
        return {
          value: { flagged, category: res.data.category, quote },
          summary: {
            verdict: flagged ? "dropped" : "clean",
            probability: res.data.injection,
            probabilityLabel: "injection",
            effect: flagged
              ? `Cut "${chunk.title} · ${chunk.section}" before drafting: ${res.data.category}${quote ? `, "${clip(quote, 90)}"` : ""}.`
              : `"${chunk.title} · ${chunk.section}" is clean and may be quoted.`,
            evidence: (res.data.evidence ?? []).map((e) => ({ target: "chunk" as const, ref: chunkId, start: e.start, end: e.end, kind: "injection" as const, label: res.data.category })),
            detail: { request: { chunk: chunkId, source: "content" }, response: { verdict: res.data.verdict, injection: res.data.injection, category: res.data.category, evidence: res.data.evidence } },
          },
        };
      },
    );
    if (verdict.flagged) poisoned.set(chunkId, verdict);
  }

  for (const p of used) {
    const bad = p.chunkIds.filter((c) => poisoned.has(c));
    for (const c of bad) {
      const chunk = index.get(c)!;
      result.dropped.push({ id: c, title: chunk.title, section: chunk.section, reason: "poisoned", relevance: p.relevance, detail: poisoned.get(c)?.quote });
    }
    const clean = p.chunkIds.filter((c) => !poisoned.has(c));
    if (!clean.length) continue;
    result.used.push(bad.length ? fromChunks(index, clean, p) : p);
  }
  return result;
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** Build one passage from chunk ids of a single article, in article order. */
function fromChunks(index: KbIndex, ids: string[], base: Pick<Passage, "relevance" | "pulledBy">): Passage {
  const chunks = ids.map((id) => index.get(id)).filter((c): c is KbChunk => Boolean(c)).sort((a, b) => a.index - b.index);
  const first = chunks[0];
  return {
    id: `${first.articleId}#${chunks.map((c) => c.index).join(",")}`,
    articleId: first.articleId,
    title: first.title,
    section: chunks.map((c) => c.section).join(" + "),
    text: chunks.map((c) => c.text).join("\n\n"),
    updated: first.updated,
    os: first.os,
    region: first.region,
    script: chunks.find((c) => c.script)?.script ?? null,
    relevance: base.relevance,
    widened: chunks.length > 1,
    chunkIds: chunks.map((c) => c.id),
    pulledBy: base.pulledBy,
  };
}

/** One passage per article: overlapping widened ranges and sibling sections are merged, best relevance first. */
export function mergeByArticle(index: KbIndex, passages: Passage[]): Passage[] {
  const byArticle = new Map<string, Passage[]>();
  for (const p of passages) byArticle.set(p.articleId, [...(byArticle.get(p.articleId) ?? []), p]);
  return [...byArticle.values()]
    .map((group) => {
      if (group.length === 1) return group[0];
      const ids = [...new Set(group.flatMap((p) => p.chunkIds))];
      return fromChunks(index, ids, { relevance: Math.max(...group.map((p) => p.relevance)), pulledBy: group.every((p) => p.pulledBy) ? group[0].pulledBy : undefined });
    })
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * When Rerank keeps a passage from an article that a newer article
 * supersedes, bring the newer article's matching section along, so Compare
 * can show the conflict and the newer rule can win. Metadata-driven, no call.
 */
export function pullNewerVersions(index: KbIndex, used: Passage[]): Passage[] {
  const have = new Set(used.map((p) => p.articleId));
  const out = [...used];
  for (const p of used) {
    const newer = index.articles.find((a) => a.meta.supersedes === p.articleId);
    if (!newer || have.has(newer.meta.id)) continue;
    const oldSection = index.get(p.chunkIds[0])?.section;
    const match = newer.chunks.find((c) => c.section === oldSection) ?? newer.chunks[0];
    if (!match) continue;
    out.push({ ...fromChunk(match, p.relevance), pulledBy: "supersedes" });
    have.add(newer.meta.id);
  }
  return out;
}

function slimResult(r: RerankResult) {
  return { id: r.id, action: r.action, reason: r.reason, relevance: r.relevance_score };
}

function classify(results: RerankResult[], passages: Passage[]): { use: Passage[]; expand: Passage[]; skipped: SkippedPassage[] } {
  const out = { use: [] as Passage[], expand: [] as Passage[], skipped: [] as SkippedPassage[] };
  const seen = new Set<number>();
  for (const r of results) {
    const p = passages[r.index];
    if (!p || (r.id && r.id !== p.id)) continue; // never trust an index that does not match the id we sent
    seen.add(r.index);
    const withScore = { ...p, relevance: r.relevance_score };
    const action: RerankAction = r.action;
    if (action === "use") out.use.push(withScore);
    else if (action === "expand") out.expand.push(withScore);
    else out.skipped.push({ id: p.id, title: p.title, section: p.section, reason: r.reason ?? "unrelated", relevance: r.relevance_score });
  }
  passages.forEach((p, i) => {
    if (!seen.has(i)) out.skipped.push({ id: p.id, title: p.title, section: p.section, reason: "below_top_n", relevance: 0 });
  });
  return out;
}

export { REASON_TEXT, pct };
