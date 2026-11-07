/**
 * Ticket history in this browser only (Schema.md: `fixproof.history.v1`).
 * Stores the masked text, never the ticket as typed.
 */
export interface HistoryEntry {
  id: string;
  createdAt: string;
  personaId: string;
  scenarioId: string | null;
  maskedText: string;
  outcome: "AUTO_RESOLVED" | "CONFIRM_WITH_USER" | "ESCALATED";
  credits: number;
}

export const HISTORY_KEY = "fixproof.history.v1";
export const HISTORY_MAX = 50;

export function readHistory(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): HistoryEntry[] {
  try {
    const raw = storage?.getItem(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]).filter((e) => e && typeof e.id === "string" && typeof e.maskedText === "string") : [];
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry, storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage): HistoryEntry[] {
  const next = [entry, ...readHistory(storage).filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
  try {
    storage?.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: history is a convenience, never required.
  }
  return next;
}

export function clearHistory(storage: Pick<Storage, "removeItem"> | undefined = globalThis.localStorage): void {
  try {
    storage?.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
