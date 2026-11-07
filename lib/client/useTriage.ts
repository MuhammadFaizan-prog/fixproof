"use client";

import { useCallback, useReducer, useRef } from "react";
import type { PublicResult } from "@/lib/agent/triage";
import type { StepEvent } from "@/lib/agent/types";
import { createSseParser } from "@/lib/sse";

/**
 * Client state for one triage run. Rows are keyed by step id, so a row's
 * `running` event is replaced in place by its `ok`/`error` event; order is
 * the order rows first appeared.
 */

export interface RunStart {
  mode: "replay" | "live";
  reason: string;
  scenarioId: string | null;
  persona: string;
}

export interface TriageState {
  status: "idle" | "running" | "done" | "error";
  start: RunStart | null;
  order: string[];
  rows: Record<string, StepEvent & { startedAt: number; endedAt?: number }>;
  result: PublicResult | null;
  error: { code: string; message: string } | null;
  startedAt: number | null;
  endedAt: number | null;
}

type Action =
  | { type: "begin"; at: number }
  | { type: "start"; data: RunStart }
  | { type: "step"; data: StepEvent; at: number }
  | { type: "result"; data: PublicResult; at: number }
  | { type: "error"; data: { code: string; message: string }; at: number }
  | { type: "reset" };

export const initialTriage: TriageState = { status: "idle", start: null, order: [], rows: {}, result: null, error: null, startedAt: null, endedAt: null };

export function triageReducer(state: TriageState, action: Action): TriageState {
  switch (action.type) {
    case "reset":
      return initialTriage;
    case "begin":
      return { ...initialTriage, status: "running", startedAt: action.at };
    case "start":
      return { ...state, start: action.data };
    case "step": {
      const prev = state.rows[action.data.id];
      const row = { ...action.data, startedAt: prev?.startedAt ?? action.at, endedAt: action.data.status === "running" ? undefined : action.at };
      return { ...state, order: prev ? state.order : [...state.order, action.data.id], rows: { ...state.rows, [action.data.id]: row } };
    }
    case "result":
      return { ...state, status: "done", result: action.data, endedAt: action.at };
    case "error":
      return { ...state, status: "error", error: action.data, endedAt: action.at };
  }
}

export interface TriageRequestBody {
  text: string;
  personaId: string;
  scenarioId?: string;
  mode: "replay" | "live";
}

export function useTriage() {
  const [state, dispatch] = useReducer(triageReducer, initialTriage);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (body: TriageRequestBody) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "begin", at: Date.now() });
    try {
      const res = await fetch("/api/triage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ code: "http", message: `FixProof answered ${res.status}.` }));
        dispatch({ type: "error", data: { code: err.code ?? "http", message: err.message ?? "Request failed." }, at: Date.now() });
        return;
      }
      const parse = createSseParser();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let gotResult = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const e of parse(decoder.decode(value, { stream: true }))) {
          const at = Date.now();
          if (e.event === "start") dispatch({ type: "start", data: e.data as RunStart });
          else if (e.event === "step") dispatch({ type: "step", data: e.data as StepEvent, at });
          else if (e.event === "result") {
            gotResult = true;
            dispatch({ type: "result", data: e.data as PublicResult, at });
          } else if (e.event === "error") dispatch({ type: "error", data: e.data as { code: string; message: string }, at });
        }
      }
      if (!gotResult) dispatch({ type: "error", data: { code: "cut", message: "The connection closed before the run finished. Nothing was sent to the employee." }, at: Date.now() });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      dispatch({ type: "error", data: { code: "network", message: "Could not reach FixProof. Check your connection and run it again." }, at: Date.now() });
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  return { state, run, reset };
}
