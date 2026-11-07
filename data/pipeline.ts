/**
 * The eight stages of a FixProof run, in order. Used by the Proof Trail to
 * show what will run before a ticket arrives, and as labels once it does.
 */
export type StageId =
  | "screen"
  | "understand"
  | "retrieve"
  | "reconcile"
  | "draft"
  | "prove"
  | "fixGate"
  | "outcome";

export interface Stage {
  id: StageId;
  title: string;
  endpoints: string[];
  promise: string;
}

export const STAGES: Stage[] = [
  {
    id: "screen",
    title: "Screen the ticket",
    endpoints: ["Protect", "Guard"],
    promise: "Personal data masked and injected instructions cut out before anything reads the ticket.",
  },
  {
    id: "understand",
    title: "Understand it",
    endpoints: ["Extract", "Fill", "Decide"],
    promise: "Exact error codes and asset tags pulled with offsets; category, severity and a resolution policy set.",
  },
  {
    id: "retrieve",
    title: "Find what applies to you",
    endpoints: ["Rerank", "Guard"],
    promise: "Knowledge base passages kept only when they fit your device and region; poisoned passages dropped.",
  },
  {
    id: "reconcile",
    title: "Check the sources agree",
    endpoints: ["Compare"],
    promise: "Conflicting articles shown side by side; the newer one wins or the ticket goes to a person.",
  },
  {
    id: "draft",
    title: "Draft the fix",
    endpoints: ["Fill"],
    promise: "A reply written only from the passages that were kept.",
  },
  {
    id: "prove",
    title: "Prove every claim",
    endpoints: ["Verify"],
    promise: "Each sentence checked against its source; anything unsupported is removed.",
  },
  {
    id: "fixGate",
    title: "Inspect the script",
    endpoints: ["Inspect"],
    promise: "The fix script is checked against your approved scope before a Run button appears.",
  },
  {
    id: "outcome",
    title: "Resolve or hand off",
    endpoints: ["Fill"],
    promise: "Resolved, confirm with you, or escalated with a complete handoff. Never a confident guess.",
  },
];
