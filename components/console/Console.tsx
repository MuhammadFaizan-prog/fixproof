"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { ProofTrailEmpty } from "@/components/shell/ProofTrailEmpty";
import { pushHistory, readHistory, type HistoryEntry } from "@/lib/client/history";
import { useTriage } from "@/lib/client/useTriage";
import type { Persona } from "@/data/personas";
import type { Scenario } from "@/data/scenarios";
import { IntakePanel } from "./IntakePanel";
import { RunView } from "./RunView";

interface ConsoleProps {
  personas: Persona[];
  scenarios: Scenario[];
}

export function Console({ personas, scenarios }: ConsoleProps) {
  const [personaId, setPersonaId] = useState(scenarios[0].personaId);
  const [scenarioId, setScenarioId] = useState<string | null>(scenarios[0].id);
  const [text, setText] = useState("");
  const [liveAvailable, setLiveAvailable] = useState<boolean | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sessionCredits, setSessionCredits] = useState(0);
  const { state, run } = useTriage();

  useEffect(() => {
    setHistory(readHistory());
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { liveAvailable?: boolean }) => setLiveAvailable(Boolean(h.liveAvailable)))
      .catch(() => setLiveAvailable(false));
  }, []);

  // Record each finished run once: masked text only.
  useEffect(() => {
    if (state.status !== "done" || !state.result || !state.start) return;
    const r = state.result;
    if (state.start.mode === "live") setSessionCredits((c) => c + r.credits);
    setHistory(
      pushHistory({
        id: `${state.startedAt}`,
        createdAt: new Date(state.startedAt ?? Date.now()).toISOString(),
        personaId: state.start.persona,
        scenarioId: state.start.scenarioId,
        maskedText: r.screen?.safeText || "[held: nothing safe to store]",
        outcome: r.outcome.outcome,
        credits: r.credits,
      }),
    );
  }, [state.status, state.result, state.start, state.startedAt]);

  const persona = useMemo(() => personas.find((p) => p.id === personaId)!, [personas, personaId]);
  const scenario = scenarioId ? scenarios.find((s) => s.id === scenarioId) ?? null : null;

  const start = () => {
    if (scenario) run({ text: scenario.text, personaId: scenario.personaId, scenarioId: scenario.id, mode: "replay" });
    else run({ text, personaId, mode: "live" });
  };

  return (
    <>
      <AppHeader mode={state.start?.mode ?? (scenario ? "replay" : "live")} sessionCredits={sessionCredits} />
      <main className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <IntakePanel
            personas={personas}
            scenarios={scenarios}
            personaId={scenario ? scenario.personaId : personaId}
            scenarioId={scenarioId}
            text={text}
            liveAvailable={liveAvailable}
            running={state.status === "running"}
            onPersona={setPersonaId}
            onScenario={(s) => {
              setScenarioId(s.id);
              setPersonaId(s.personaId);
            }}
            onText={(t) => {
              setScenarioId(null);
              setText(t);
            }}
            onRun={start}
          />
          {history.length ? (
            <p className="mt-3 px-1 text-xs text-muted-foreground">
              {history.length} ticket{history.length === 1 ? "" : "s"} in this browser&apos;s history (masked text only).
            </p>
          ) : null}
        </div>
        <div className="min-w-0 lg:col-span-7">
          {state.status === "idle" ? <ProofTrailEmpty /> : <RunView state={state} persona={state.start ? personas.find((p) => p.id === state.start!.persona) ?? persona : persona} />}
        </div>
      </main>
    </>
  );
}
