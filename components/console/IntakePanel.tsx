"use client";

import { Lock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Persona } from "@/data/personas";
import type { Scenario } from "@/data/scenarios";
import { OUTCOME_STYLE } from "./outcome-style";
import { Chip, Panel } from "./primitives";

const MAX = 4000;

interface IntakePanelProps {
  personas: Persona[];
  scenarios: Scenario[];
  personaId: string;
  scenarioId: string | null;
  text: string;
  liveAvailable: boolean | null;
  /** Why live is off: no key on this deployment, or today's live credit budget is spent. */
  liveBlocked?: "no_key" | "daily_cap" | null;
  running: boolean;
  onPersona: (id: string) => void;
  onScenario: (s: Scenario) => void;
  onText: (t: string) => void;
  onRun: () => void;
}

/**
 * Left column: the ticket queue (recorded presets as D-style boxed rows with
 * an outcome chip) and the composer (employee picker sets Rerank's context and
 * Inspect's approved scope; free text runs live only with a key).
 */
export function IntakePanel(p: IntakePanelProps) {
  const preset = p.scenarioId ? p.scenarios.find((s) => s.id === p.scenarioId) ?? null : null;
  const persona = p.personas.find((x) => x.id === p.personaId)!;
  const freeTextBlocked = !preset && p.liveAvailable === false;
  const canRun = !p.running && (preset !== null || (p.text.trim().length > 0 && p.liveAvailable === true));

  return (
    <div className="flex flex-col gap-4 xl:gap-5">
      <Panel id="queue" aria-labelledby="presets-h" className="scroll-mt-24 px-4 pb-4 pt-5 sm:px-5">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 id="presets-h" className="text-[22px] font-medium leading-8 tracking-[-0.015em]">
            Tickets
          </h2>
          <Chip>{p.scenarios.length} recorded</Chip>
        </div>
        <p className="mt-0.5 px-1 text-[13px] leading-[18px] text-muted-foreground">Replayed from live Clocked runs · no credits</p>
        <ul className="mt-3 flex flex-col gap-2">
          {p.scenarios.map((s) => {
            const style = OUTCOME_STYLE[s.recorded];
            const active = s.id === p.scenarioId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => p.onScenario(s)}
                  aria-pressed={active}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[18px] border px-3.5 py-2.5 text-left transition-colors duration-150",
                    active ? "border-primary/30 bg-primary-soft" : "border-hairline bg-card hover:border-neutral/60",
                  )}
                >
                  <span className="min-w-0">
                    <span className={cn("block truncate text-[15px] font-medium leading-[22px]", active && "text-primary")}>{s.title}</span>
                    <span className="block truncate text-[13px] leading-[18px] text-muted-foreground">{s.text}</span>
                  </span>
                  <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium", style.pill)}>
                    <span aria-hidden className={cn("size-1.5 rounded-full", style.dot)} />
                    {style.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel aria-labelledby="ticket-h" className="px-4 pb-5 pt-5 sm:px-5">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 id="ticket-h" className="min-w-0 truncate text-[22px] font-medium leading-8 tracking-[-0.015em]">
            {preset ? "Ticket" : "Write a ticket"}
          </h2>
          {preset ? (
            <Chip icon={Lock}>preset text</Chip>
          ) : null}
        </div>

        <fieldset className="mt-3" disabled={Boolean(preset) || p.running}>
          <legend className="mb-2 px-1 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-muted-foreground">Employee</legend>
          <div className="flex flex-col gap-2">
            {p.personas.map((x) => {
              const on = x.id === p.personaId;
              return (
                <label
                  key={x.id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-[18px] border px-3.5 py-2 transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    on ? "border-primary/30 bg-primary-soft" : "border-hairline bg-card hover:border-neutral/60",
                    preset && !on && "opacity-60",
                  )}
                >
                  <input type="radio" name="persona" value={x.id} checked={on} onChange={() => p.onPersona(x.id)} className="sr-only" />
                  <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-primary" : "border-neutral")}>
                    {on ? <span className="size-2 rounded-full bg-primary" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium leading-5">{x.name}</span>
                    <span className="block truncate text-[12.5px] leading-[18px] text-muted-foreground">
                      {x.osLabel} · {x.office}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label htmlFor="ticket" className="mb-2 mt-4 block px-1 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-muted-foreground">
          Ticket text
        </label>
        <textarea
          id="ticket"
          rows={5}
          maxLength={MAX}
          value={preset ? preset.text : p.text}
          readOnly={Boolean(preset)}
          onChange={(e) => p.onText(e.target.value)}
          placeholder="Describe the problem the way an employee would. Personal details are masked before any step reads them."
          className="block w-full resize-y rounded-[18px] border border-hairline bg-card px-3.5 py-3 text-[14px] leading-[21px] placeholder:text-muted-foreground read-only:text-muted-foreground"
        />
        <div className="mt-1.5 flex justify-between px-1 text-[12px] text-muted-foreground">
          <span className="truncate">{persona.device} · {persona.assetTag}</span>
          {!preset ? <span className="tabular shrink-0">{p.text.length.toLocaleString()} / {MAX.toLocaleString()}</span> : null}
        </div>

        {freeTextBlocked ? (
          <p role="note" className="mt-3 rounded-[18px] bg-warn-soft px-3.5 py-2.5 text-[13px] leading-5 text-warn">
            {p.liveBlocked === "daily_cap"
              ? "Live mode has used today's credit budget, so your own tickets cannot run until midnight UTC. The recorded tickets above replay real runs."
              : "This deployment has no Clocked key, so your own tickets cannot run. The recorded tickets above replay real runs."}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" className="h-11 flex-1 rounded-full px-5 text-[15px]" onClick={p.onRun} disabled={!canRun}>
            {p.running ? (
              "Running…"
            ) : preset ? (
              <>
                <Play aria-hidden /> Replay run
              </>
            ) : (
              "Run FixProof"
            )}
          </Button>
          {preset ? (
            <Button type="button" variant="outline" className="h-11 rounded-full border-hairline bg-card px-4 text-[15px]" onClick={() => p.onText("")} disabled={p.running}>
              Write my own
            </Button>
          ) : null}
        </div>
        <p className="mt-2 px-1 text-[12px] leading-[18px] text-muted-foreground">
          {preset ? "Replays the recorded live run. Spends no credits." : "Runs live on Clocked (about 30–50 credits)."}
        </p>
      </Panel>
    </div>
  );
}
