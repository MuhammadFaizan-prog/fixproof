import type { StepEvent } from "@/lib/agent/types";

/**
 * Replay pacing. A recorded run streams from the server in ~100 ms, which
 * reads as one burst. On the client we re-time it: each finished step waits
 * 80–150 ms, scaled from its recorded model time, and the whole run is kept
 * under about 2 s. `running` events cost nothing, so a row shows its pending
 * state and then resolves when its own delay is up.
 */
export const PACE = { min: 80, max: 150, budget: 1900, floor: 40 } as const;

/** Delay before showing this event, in ms. */
export function stepDelay(e: StepEvent): number {
  if (e.status === "running") return 0;
  const ms = e.meta?.modelMs;
  if (ms == null) return PACE.min; // local steps: still a visible beat
  // 0–400 ms of model time maps onto 80–150 ms of screen time.
  const t = Math.min(1, Math.max(0, ms / 400));
  return Math.round(PACE.min + t * (PACE.max - PACE.min));
}

/** Delays for a whole buffered run, compressed proportionally when they would exceed the budget. */
export function paceDelays(events: StepEvent[], budget: number = PACE.budget): number[] {
  const raw = events.map(stepDelay);
  const total = raw.reduce((a, b) => a + b, 0);
  if (total <= budget) return raw;
  const k = budget / total;
  return raw.map((d) => (d === 0 ? 0 : Math.max(PACE.floor, Math.round(d * k))));
}

/** True when the visitor asked the OS for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
