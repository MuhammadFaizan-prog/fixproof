import type { Outcome } from "@/data/scenarios";

/** One place for outcome colours and words (DESIGN.md: Resolved green, Confirm amber, Escalated red). */
export const OUTCOME_STYLE: Record<Outcome, { label: string; short: string; bar: string; pill: string; text: string }> = {
  AUTO_RESOLVED: { label: "Resolved", short: "Resolves", bar: "bg-ok", pill: "bg-ok-soft text-ok", text: "text-ok" },
  CONFIRM_WITH_USER: { label: "Confirm", short: "Confirms", bar: "bg-warn", pill: "bg-warn-soft text-warn", text: "text-warn" },
  ESCALATED: { label: "Escalated", short: "Escalates", bar: "bg-risk", pill: "bg-risk-soft text-risk", text: "text-risk" },
};
