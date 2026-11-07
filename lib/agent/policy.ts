/**
 * Outcome policy. Pure functions only (no I/O) so every band is unit-tested.
 * Thresholds live here and nowhere else; a change to a band needs a test change.
 */

export type DecideChoice = "auto_resolve" | "suggest" | "escalate";
export type Band = "auto" | "confirm" | "escalate";

export const BANDS = {
  /** auto_resolve must be at least this likely for the auto band. */
  autoMin: 0.8,
  /** escalate at or above this sends the ticket to a person. Between the bands is a close call, which confirms. */
  escalateMin: 0.7,
  /** below this, the self-service-safe noul blocks the auto band. */
  selfServiceMin: 0.5,
} as const;

/** Map Decide's probabilities to a band. The middle of the distribution never auto-resolves. */
export function decideBand(probabilities: Partial<Record<DecideChoice, number>>, selfServiceSafe: number): { band: Band; reason: string } {
  const auto = probabilities.auto_resolve ?? 0;
  const esc = probabilities.escalate ?? 0;
  if (esc >= BANDS.escalateMin) return { band: "escalate", reason: `escalate is ${Math.round(esc * 100)}% likely` };
  if (auto >= BANDS.autoMin && selfServiceSafe >= BANDS.selfServiceMin) {
    return { band: "auto", reason: `auto_resolve is ${Math.round(auto * 100)}% likely and self-service is safe` };
  }
  if (auto >= BANDS.autoMin) return { band: "confirm", reason: `self-service safety is only ${Math.round(selfServiceSafe * 100)}%` };
  return { band: "confirm", reason: `auto_resolve is only ${Math.round(auto * 100)}% likely (needs ${Math.round(BANDS.autoMin * 100)}%)` };
}
