"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { pushHistory, readHistory, type HistoryEntry } from "@/lib/client/history";
import { useTriage } from "@/lib/client/useTriage";
import type { Persona } from "@/data/personas";
import type { Scenario } from "@/data/scenarios";
import { IntakePanel } from "./IntakePanel";
import { RunView } from "./RunView";
import { EvidenceRail } from "./EvidenceRail";
import { cn } from "@/lib/utils";

interface ConsoleProps {
  personas: Persona[];
  scenarios: Scenario[];
}

export function Console({ personas, scenarios }: ConsoleProps) {
  const [personaId, setPersonaId] = useState(scenarios[0].personaId);
  const [scenarioId, setScenarioId] = useState<string | null>(scenarios[0].id);
  const [text, setText] = useState("");
  const [liveAvailable, setLiveAvailable] = useState<boolean | null>(null);
  const [liveBlocked, setLiveBlocked] = useState<"no_key" | "daily_cap" | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sessionCredits, setSessionCredits] = useState(0);
  const { state, run } = useTriage();

  useEffect(() => {
    setHistory(readHistory());
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { liveAvailable?: boolean; keyConfigured?: boolean; dailyCapReached?: boolean }) => {
        setLiveAvailable(Boolean(h.liveAvailable));
        setLiveBlocked(h.liveAvailable ? null : h.keyConfigured && h.dailyCapReached ? "daily_cap" : "no_key");
      })
      .catch(() => {
        setLiveAvailable(false);
        setLiveBlocked("no_key");
      });
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

  const runPersona = state.start ? (personas.find((p) => p.id === state.start!.persona) ?? persona) : persona;
  const runScenario = state.start ? (state.start.scenarioId ? (scenarios.find((s) => s.id === state.start!.scenarioId) ?? null) : null) : scenario;
  const active = state.status !== "idle";
  const mainRef = useRef<HTMLDivElement>(null);
  // Below xl the columns stack; once a run starts the outcome comes first, so bring it into view.
  useEffect(() => {
    if (state.status === "running" && !window.matchMedia("(min-width: 1280px)").matches) window.scrollTo({ top: 0, behavior: "auto" });
    if (state.status === "running") mainRef.current?.scrollTo({ top: 0 });
  }, [state.status, state.startedAt]);

  return (
    <div className="flex min-h-dvh flex-col xl:h-dvh">
      <AppHeader mode={state.start?.mode ?? (scenario ? "replay" : "live")} sessionCredits={sessionCredits} />
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 px-3 pb-6 sm:px-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:min-h-0 xl:grid-cols-[340px_minmax(0,1fr)_344px] xl:gap-5 xl:pb-5">
        <aside aria-label="Tickets" className={cn("fp-scroll min-w-0 lg:row-span-2 xl:row-span-1 xl:overflow-y-auto xl:pb-1", active ? "order-3 lg:order-none" : "order-1 lg:order-none")}>
          <IntakePanel
            personas={personas}
            scenarios={scenarios}
            personaId={scenario ? scenario.personaId : personaId}
            scenarioId={scenarioId}
            text={text}
            liveAvailable={liveAvailable}
            liveBlocked={liveBlocked}
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
        </aside>
        <main ref={mainRef} className={cn("fp-scroll min-w-0 xl:overflow-y-auto xl:pb-1", active ? "order-1 lg:order-none" : "order-2 lg:order-none")}>
          <RunView state={state} persona={runPersona} scenario={runScenario} history={history} scenarios={scenarios} />
        </main>
        <aside aria-label="Evidence and scope" className={cn("fp-scroll min-w-0 xl:overflow-y-auto xl:pb-1", active ? "order-2 lg:order-none" : "order-3 lg:order-none", "lg:col-start-2 xl:col-start-auto")}>
          <EvidenceRail state={state} persona={runPersona} />
        </aside>
      </div>
    </div>
  );
}
