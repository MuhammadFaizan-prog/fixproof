import { z } from "zod";

export const KB_CATEGORIES = ["network", "identity", "hardware", "software", "printing", "security", "accounts"] as const;
export const KB_OS = ["windows", "macos", "linux", "any"] as const;
export const KB_REGIONS = ["uk", "us", "pk", "any"] as const;
export const SCRIPT_LANGS = ["powershell", "bash", "zsh"] as const;

export const ArticleMetaSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    title: z.string().min(1).max(120),
    category: z.enum(KB_CATEGORIES),
    os: z.array(z.enum(KB_OS)).min(1),
    region: z.array(z.enum(KB_REGIONS)).min(1),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    supersedes: z.string().optional(),
    has_script: z.boolean(),
    script_lang: z.enum(SCRIPT_LANGS).optional(),
    synthetic: z.literal(true),
  })
  .refine((m) => !m.has_script || m.script_lang !== undefined, { message: "has_script needs script_lang" });

export type ArticleMeta = z.infer<typeof ArticleMetaSchema>;

export interface KbScript {
  lang: (typeof SCRIPT_LANGS)[number];
  code: string;
}

/** One `##` section of an article: the retrieval and citation unit. */
export interface KbChunk {
  /** "<articleId>#<index>" */
  id: string;
  articleId: string;
  index: number;
  title: string;
  section: string;
  /** Section heading plus body, exactly as written (offsets from Clocked refer to this string). */
  text: string;
  os: ArticleMeta["os"];
  region: ArticleMeta["region"];
  category: ArticleMeta["category"];
  updated: string;
  script: KbScript | null;
}

export interface KbArticle {
  meta: ArticleMeta;
  body: string;
  chunks: KbChunk[];
}
