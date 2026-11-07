import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArticle } from "./parse";
import type { KbArticle } from "./types";

export const KB_DIR = path.join(process.cwd(), "data", "kb");

/** Server-only: read and validate every article in data/kb. Throws on any invalid file. */
export function loadKb(dir = KB_DIR): KbArticle[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const articles = files.map((file) => parseArticle(readFileSync(path.join(dir, file), "utf8"), file.replace(/\.md$/, "")));
  const ids = new Set(articles.map((a) => a.meta.id));
  for (const a of articles) {
    if (a.meta.supersedes && !ids.has(a.meta.supersedes)) {
      throw new Error(`article "${a.meta.id}" supersedes unknown article "${a.meta.supersedes}"`);
    }
  }
  return articles;
}
