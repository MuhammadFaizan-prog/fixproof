/**
 * The judge tour: four recorded presets in order, each with one line on what
 * Clocked changed in that run. Replay only, so it needs no key and spends
 * no credits.
 */
export interface TourStop {
  scenarioId: string;
  title: string;
  caption: string;
}

export const TOUR: TourStop[] = [
  {
    scenarioId: "vpn-macos",
    title: "A routine fix, resolved",
    caption:
      "Rerank read every passage with Priya's Mac as context and skipped the Windows and Linux articles. Verify backed each sentence with a source quote, and Inspect cleared the script for her laptop, so Run fix appears.",
  },
  {
    scenarioId: "admin-injection",
    title: "An injected instruction, cut out",
    caption:
      "Guard found the 'ignore your previous instructions' sentence by its exact position. FixProof cut it, re-checked the rest, and still answered the honest part (a laptop that won't charge), asking Hannah to confirm.",
  },
  {
    scenarioId: "tampered-printer",
    title: "A tampered fix script, blocked",
    caption:
      "Inspect flagged the line in the knowledge-base script that turns off antivirus, so there is no Run button. Fill wrote the handoff for a technician with what was already tried, and Hannah still got the safe steps.",
  },
  {
    scenarioId: "vpn-conflict",
    title: "Two policies disagree",
    caption:
      "Compare found that the 2024 and 2026 VPN policies contradict each other. The newer policy stands, the older passage is removed before drafting, and both quotes are shown side by side.",
  },
];
