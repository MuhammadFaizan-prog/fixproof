/**
 * Server-Sent Events over a POST response. The browser cannot use
 * EventSource for POST, so the client reads the body stream and parses the
 * same frames. Both sides live here so they cannot drift.
 */

export type SseEvent = { event: string; data: unknown };

export function encodeSse(event: string, data: unknown): string {
  const json = JSON.stringify(data);
  return `event: ${event}\ndata: ${json}\n\n`;
}

/** Incremental parser: feed chunks, get complete events back. */
export function createSseParser(): (chunk: string) => SseEvent[] {
  let buffer = "";
  return (chunk) => {
    buffer += chunk;
    const out: SseEvent[] = [];
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue;
      try {
        out.push({ event, data: JSON.parse(data.join("\n")) });
      } catch {
        // A malformed frame is skipped, never fatal.
      }
    }
    return out;
  };
}
