/**
 * Split a drafted reply into claims we own. Verify accepts explicit claims,
 * so each sentence is checked on its own and an unsupported one can be cut
 * from the reply exactly, instead of guessing where a model-split claim sits.
 */
export function splitSentences(text: string, max = 30): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const parts = line.split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/);
    let carry = "";
    for (const raw of parts) {
      const part = raw.trim();
      if (!part) continue;
      // "1." or "2)" on its own is a list marker, not a sentence.
      if (/^\d+[.)]$/.test(part)) {
        carry = `${carry}${part} `;
        continue;
      }
      out.push(`${carry}${part}`.trim());
      carry = "";
    }
    if (carry.trim()) out.push(carry.trim());
  }
  if (out.length <= max) return out;
  // Keep the claim count inside Verify's limit by joining the tail.
  return [...out.slice(0, max - 1), out.slice(max - 1).join(" ")];
}
