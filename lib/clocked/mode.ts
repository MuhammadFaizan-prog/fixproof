import { hasApiKey } from "./client";

export type RunMode = "replay" | "live";

export interface ModeInput {
  /** What the visitor asked for. */
  requested: RunMode;
  /** Preset scenarios always replay so judging traffic never spends credits. */
  isPreset: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface ModeDecision {
  mode: RunMode;
  reason: "no_key" | "preset" | "requested_replay" | "live";
}

/** Replay unless a key exists, the ticket is free text, and live was asked for. */
export function resolveMode({ requested, isPreset, env = process.env }: ModeInput): ModeDecision {
  if (!hasApiKey(env)) return { mode: "replay", reason: "no_key" };
  if (isPreset) return { mode: "replay", reason: "preset" };
  if (requested === "replay") return { mode: "replay", reason: "requested_replay" };
  return { mode: "live", reason: "live" };
}
