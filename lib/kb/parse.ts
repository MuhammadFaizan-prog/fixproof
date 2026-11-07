import { ArticleMetaSchema, type KbArticle, type KbChunk, type KbScript } from "./types";

/**
 * Parse one KB markdown file: a small YAML frontmatter block (scalars and
 * inline lists only), then `#` title and `##` sections. No YAML dependency:
 * the KB is ours and its frontmatter is deliberately flat.
 */
export function parseFrontmatter(source: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) throw new Error("missing frontmatter");
  const data: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`bad frontmatter line: ${line}`);
    const [, key, raw] = kv;
    const value = raw.trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (value === "true" || value === "false") {
      data[key] = value === "true";
    } else {
      data[key] = value;
    }
  }
  return { data, body: source.slice(match[0].length) };
}

const FENCE = /```(powershell|bash|zsh)\n([\s\S]*?)```/;

export function parseArticle(source: string, fileId?: string): KbArticle {
  const { data, body } = parseFrontmatter(source);
  const meta = ArticleMetaSchema.parse(data);
  if (fileId !== undefined && fileId !== meta.id) throw new Error(`article id "${meta.id}" does not match file "${fileId}"`);

  const sections = body.split(/\n(?=## )/).filter((part) => part.trimStart().startsWith("## "));
  const chunks: KbChunk[] = sections.map((raw, index) => {
    const text = raw.trim();
    const section = text.split("\n", 1)[0].replace(/^##\s+/, "").trim();
    const fence = FENCE.exec(text);
    const script: KbScript | null = fence ? { lang: fence[1] as KbScript["lang"], code: fence[2].trimEnd() } : null;
    return {
      id: `${meta.id}#${index}`,
      articleId: meta.id,
      index,
      title: meta.title,
      section,
      text,
      os: meta.os,
      region: meta.region,
      category: meta.category,
      updated: meta.updated,
      script,
    };
  });

  if (chunks.length === 0) throw new Error(`article "${meta.id}" has no ## sections`);
  const hasScript = chunks.some((c) => c.script !== null);
  if (hasScript !== meta.has_script) throw new Error(`article "${meta.id}" has_script=${meta.has_script} but script found=${hasScript}`);
  return { meta, body, chunks };
}
