"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { pushHistory, readHistory, type HistoryEntry } from "@/lib/client/history";
import { useTriage } from "@/lib/client/useTriage";
import type { Persona } from "@/data/personas";
import type { Scenario } from "@/data/scenarios";
import { TOUR } from "@/data/tour";
import { isFaultId, type FaultId } from "@/lib/clocked/faults";
import { TourBar } from "./TourBar";
import { IntakePanel } from "./IntakePanel";
import { RunView } from "./RunView";
import { EvidenceRail } from "./EvidenceRail";
import { cn } from "@/lib/utils";
import { useHydratedMarker, useScrollTabStop } from "@/lib/client/useScrollTabStop";
import type { Pane } from "@/components/shell/AppHeader";

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
  // Below 1024 px the three columns become panes switched from the top bar (tablet shows the rail under the run).
  const [pane, setPane] = useState<Pane>("tickets");
  const [tour, setTour] = useState<number | null>(null);
  const [simulate, setSimulate] = useState<FaultId | null>(null);

  const replay = useCallback(
    (s: Scenario, fault: FaultId | null = null) => {
      setScenarioId(s.id);
      setPersonaId(s.personaId);
      setSimulate(fault);
      run({ text: s.text, personaId: s.personaId, scenarioId: s.id, mode: "replay", ...(fault ? { simulate: fault } : {}) });
    },
    [run],
  );
  const goTour = useCallback(
    (i: number) => {
      const s = scenarios.find((x) => x.id === TOUR[i].scenarioId);
      if (!s) return;
      setTour(i);
      replay(s, TOUR[i].simulate ?? null);
    },
    [scenarios, replay],
  );
  const exitTour = useCallback(() => {
    setTour(null);
    setSimulate(null);
  }, []);

  // Deep links: /?tour=1 starts the judge tour; /?preset=<id> replays one preset.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("tour")) goTour(0);
    else {
      const s = q.get("preset") ? scenarios.find((x) => x.id === q.get("preset")) : undefined;
      const fail = q.get("fail");
      if (s) replay(s, isFaultId(fail) ? fail : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (scenario) run({ text: scenario.text, personaId: scenario.personaId, scenarioId: scenario.id, mode: "replay", ...(simulate ? { simulate } : {}) });
    else run({ text, personaId, mode: "live" });
  };

  const runPersona = state.start ? (personas.find((p) => p.id === state.start!.persona) ?? persona) : persona;
  const runScenario = state.start ? (state.start.scenarioId ? (scenarios.find((s) => s.id === state.start!.scenarioId) ?? null) : null) : scenario;
  // Each column is a tab stop only while it scrolls (xl and up); the run column keeps programmatic focus.
  const [mainRef, mainTab] = useScrollTabStop<HTMLElement>(-1);
  const [ticketsRef, ticketsTab] = useScrollTabStop<HTMLElement>();
  const [evidenceRef, evidenceTab] = useScrollTabStop<HTMLElement>();
  useHydratedMarker();
  const recordedAt = state.start?.mode === "replay" ? (state.order.map((id) => state.rows[id].meta?.recordedAt).find(Boolean) ?? null) : null;
  // Below xl the columns stack; once a run starts the outcome comes first, so bring it into view.
  useEffect(() => {
    if (state.status !== "running") return;
    setPane("run");
    if (!window.matchMedia("(min-width: 1280px)").matches) window.scrollTo({ top: 0, behavior: "auto" });
    mainRef.current?.scrollTo({ top: 0 });
  }, [state.status, state.startedAt]);
  const choosePane = (p: Pane) => {
    setPane(p);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <div className="flex min-h-dvh flex-col xl:h-dvh">
      <AppHeader mode={state.start?.mode ?? (scenario ? "replay" : "live")} recordedAt={recordedAt} onTour={tour === null ? () => goTour(0) : undefined} sessionCredits={sessionCredits} pane={pane} onPane={choosePane} runOutcome={state.result?.outcome.outcome ?? (state.status === "running" ? "running" : null)} />
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 px-3 pb-6 sm:px-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:min-h-0 xl:grid-cols-[340px_minmax(0,1fr)_344px] xl:gap-5 xl:pb-5">
        <aside id="pane-tickets" ref={ticketsRef} aria-label="Tickets" tabIndex={ticketsTab} className={cn("fp-scroll min-w-0 lg:row-span-2 xl:row-span-1 xl:overflow-y-auto xl:pb-1", pane !== "tickets" && "max-lg:hidden")}>
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
              setTour(null);
              setScenarioId(s.id);
              setPersonaId(s.personaId);
            }}
            onText={(t) => {
              setScenarioId(null);
              setSimulate(null);
              setText(t);
            }}
            onRun={start}
            simulate={simulate}
            onSimulate={setSimulate}
          />
        </aside>
        <main id="pane-run" ref={mainRef} tabIndex={mainTab} aria-label="Run" className={cn("fp-scroll min-w-0 xl:overflow-y-auto xl:pb-1", pane === "tickets" && "max-lg:hidden", pane === "evidence" && "max-md:hidden")}>
          {tour !== null ? (
            <div className="mb-4 xl:mb-5">
              <TourBar stops={TOUR} index={tour} onBack={() => goTour(Math.max(0, tour - 1))} onNext={() => goTour(Math.min(TOUR.length - 1, tour + 1))} onExit={exitTour} />
            </div>
          ) : null}
          <RunView state={state} persona={runPersona} scenario={runScenario} history={history} scenarios={scenarios} onReplay={runScenario ? () => replay(runScenario, simulate) : undefined} onFallback={() => replay(scenarios[0])} />
        </main>
        <aside id="pane-evidence" ref={evidenceRef} aria-label="Evidence and scope" tabIndex={evidenceTab} className={cn("fp-scroll min-w-0 xl:overflow-y-auto xl:pb-1", "lg:col-start-2 xl:col-start-auto", pane === "tickets" && "max-lg:hidden", pane === "run" && "max-md:hidden")}>
          <EvidenceRail state={state} persona={runPersona} />
        </aside>
      </div>
    </div>
  );
}
