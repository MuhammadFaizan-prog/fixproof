import type { Outcome } from "@/data/scenarios";

/** One place for outcome colours and words (DESIGN.md D tokens: Resolved mint, Confirm gold, Escalated red). */
export const OUTCOME_STYLE: Record<Outcome, { label: string; short: string; dot: string; bar: string; pill: string; text: string }> = {
  AUTO_RESOLVED: { label: "Resolved", short: "Resolves", dot: "bg-ok-fill", bar: "bg-ok-fill", pill: "bg-ok-soft text-ok", text: "text-ok" },
  CONFIRM_WITH_USER: { label: "Confirm", short: "Confirms", dot: "bg-warn-fill", bar: "bg-warn-fill", pill: "bg-warn-soft text-warn", text: "text-warn" },
  ESCALATED: { label: "Escalated", short: "Escalates", dot: "bg-risk-fill", bar: "bg-risk-fill", pill: "bg-risk-soft text-risk", text: "text-risk" },
};
