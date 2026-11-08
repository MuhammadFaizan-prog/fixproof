/**
 * The recorded technician edit for the human-in-the-loop demo: on the payroll
 * preset, a technician adds a restoration time that no article states. The
 * exact text below was re-verified live once and recorded, so the desk view
 * replays it with no key. Any other edit needs a live call.
 */
export const RECORDED_EDITS: Record<string, { label: string; sentence: string }> = {
  "payroll-eta": { label: "Add an ETA the KB never states", sentence: "The payroll portal will be back by 2pm today." },
};

/** The edited reply the recording was made from: the verified reply plus the added sentence on its own line. */
export function scriptedEdit(reply: string, sentence: string): string {
  return `${reply.trim()}\n${sentence}`;
}
