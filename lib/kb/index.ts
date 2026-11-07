import MiniSearch from "minisearch";
import { loadKb } from "./load";
import type { KbArticle, KbChunk } from "./types";

/**
 * Cheap lexical recall over KB chunks (BM25 via MiniSearch). It only has to
 * get the right passages into the top 20; Clocked Rerank does the judgment of
 * which ones apply to this employee.
 */

export interface KbHit {
  chunk: KbChunk;
  score: number;
  /** Query terms that matched this chunk. */
  terms: string[];
}

export interface KbIndex {
  readonly articles: KbArticle[];
  readonly chunkCount: number;
  search(query: string, opts?: { limit?: number }): KbHit[];
  get(chunkId: string): KbChunk | undefined;
  /** The chunks immediately before and after one chunk in the same article (for Rerank's `expand`). */
  neighbors(chunkId: string, radius?: number): KbChunk[];
  /** Every chunk of an article, in order. */
  articleChunks(articleId: string): KbChunk[];
}

/** Words that carry no retrieval signal in help-desk tickets. */
const STOPWORDS = new Set(
  "a an and are as at be been but by can could do does for from had has have hi hello how i i'm im in is it it's its just me my of on or our please so that the their them then there this to too was we what when where which who why will with would you your yes no not dont don't can't cant since today yesterday".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) ?? [];
}

function processTerm(term: string): string | null {
  const t = term.toLowerCase();
  return t.length < 2 || STOPWORDS.has(t) ? null : t;
}

export function buildKbIndex(articles: KbArticle[]): KbIndex {
  const chunks = articles.flatMap((a) => a.chunks);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const byArticle = new Map(articles.map((a) => [a.meta.id, a.chunks]));

  const mini = new MiniSearch<KbChunk>({
    idField: "id",
    fields: ["title", "section", "text"],
    storeFields: [],
    tokenize,
    processTerm,
    searchOptions: {
      boost: { title: 2, section: 1.5 },
      prefix: (term) => term.length >= 4,
      fuzzy: (term) => (term.length >= 6 ? 0.2 : false),
      combineWith: "OR",
      processTerm,
    },
  });
  mini.addAll(chunks);

  return {
    articles,
    chunkCount: chunks.length,
    search(query, { limit = 20 } = {}) {
      if (!query.trim()) return [];
      return mini
        .search(query)
        .slice(0, limit)
        .map((r) => ({ chunk: byId.get(String(r.id)) as KbChunk, score: r.score, terms: r.terms }));
    },
    get: (chunkId) => byId.get(chunkId),
    neighbors(chunkId, radius = 1) {
      const chunk = byId.get(chunkId);
      if (!chunk) return [];
      const siblings = byArticle.get(chunk.articleId) ?? [];
      return siblings.filter((c) => c.index !== chunk.index && Math.abs(c.index - chunk.index) <= radius);
    },
    articleChunks: (articleId) => byArticle.get(articleId) ?? [],
  };
}

let cached: KbIndex | null = null;

/** Server-only singleton: the committed KB, indexed once per server instance. */
export function getKbIndex(): KbIndex {
  cached ??= buildKbIndex(loadKb());
  return cached;
}
