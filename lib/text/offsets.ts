/**
 * Clocked reports offsets in Unicode code points (docs: Responses). JavaScript
 * strings index UTF-16 code units, so an emoji or some CJK characters would
 * shift every later span by one. Everything that applies an API offset goes
 * through these helpers; nothing calls String.prototype.slice on API offsets.
 */
import type { Span } from "@/lib/clocked/types";

export function codePoints(text: string): string[] {
  return Array.from(text);
}

export function cpLength(text: string): number {
  return codePoints(text).length;
}

export function cpSlice(text: string, start: number, end?: number): string {
  return codePoints(text).slice(start, end).join("");
}

/** True when the span is inside the text and not empty. */
export function isValidSpan(text: string, span: Span): boolean {
  const n = cpLength(text);
  return Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end <= n && span.start < span.end;
}

/** Sort spans and merge any that overlap or touch. Invalid spans are dropped. */
export function mergeSpans(text: string, spans: Span[]): Span[] {
  const valid = spans.filter((s) => isValidSpan(text, s)).sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Span[] = [];
  for (const s of valid) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

export interface Replacement extends Span {
  /** Text that stands in for the span, e.g. "<PERSON>". */
  replacement: string;
}

/**
 * Rewrite a text by code-point spans: `remove` spans are cut out, and
 * `replace` spans are swapped for their placeholder. Removal wins where the
 * two overlap (an injected sentence that also contains a name is cut whole).
 * Whitespace left doubled by a cut is collapsed; offsets into the result are
 * not meaningful against the input.
 */
export function rewrite(text: string, { remove = [], replace = [] }: { remove?: Span[]; replace?: Replacement[] }): string {
  const chars = codePoints(text);
  const removed = new Uint8Array(chars.length);
  for (const s of mergeSpans(text, remove)) removed.fill(1, s.start, s.end);

  // owner[i] = index into `replace` for code point i, or -1.
  const owner = new Int32Array(chars.length).fill(-1);
  replace.forEach((r, idx) => {
    if (!isValidSpan(text, r)) return;
    for (let i = r.start; i < r.end; i++) if (owner[i] === -1) owner[i] = idx;
  });

  let out = "";
  let cutHere = false;
  for (let i = 0; i < chars.length; i++) {
    if (removed[i]) {
      cutHere = true;
      continue;
    }
    if (owner[i] !== -1) {
      const idx = owner[i];
      if (i === 0 || owner[i - 1] !== idx || removed[i - 1]) out += replace[idx].replacement;
      continue;
    }
    if (cutHere && /\s/.test(chars[i]) && (out === "" || /\s$/.test(out))) continue;
    cutHere = false;
    out += chars[i];
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/** Remove spans and return what is left (used for "the safe remainder"). */
export function removeSpans(text: string, spans: Span[]): string {
  return rewrite(text, { remove: spans });
}

/** Split a text into pieces for highlighting: plain runs and marked spans in order. */
export interface Segment<K extends string = string> {
  text: string;
  mark: K | null;
  start: number;
  end: number;
}

export function segment<K extends string>(text: string, marks: (Span & { kind: K })[]): Segment<K>[] {
  const chars = codePoints(text);
  const kinds: (K | null)[] = new Array(chars.length).fill(null);
  for (const m of [...marks].sort((a, b) => a.start - b.start)) {
    if (!isValidSpan(text, m)) continue;
    for (let i = m.start; i < m.end; i++) if (kinds[i] === null) kinds[i] = m.kind;
  }
  const out: Segment<K>[] = [];
  let i = 0;
  while (i < chars.length) {
    const k = kinds[i];
    let j = i;
    while (j < chars.length && kinds[j] === k) j++;
    out.push({ text: chars.slice(i, j).join(""), mark: k, start: i, end: j });
    i = j;
  }
  return out;
}
