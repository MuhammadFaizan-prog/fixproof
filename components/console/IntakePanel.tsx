"use client";

import { ArrowUpRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Persona } from "@/data/personas";
import type { Scenario } from "@/data/scenarios";
import { OUTCOME_STYLE } from "./outcome-style";

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
 * Left column. Presets read like a help-desk queue (DESIGN.md R2 ticket
 * rows: 4 px status bar, title + one-line preview, pill); the employee
 * picker sets Rerank's context and Inspect's approved scope.
 */
export function IntakePanel(p: IntakePanelProps) {
  const preset = p.scenarioId ? p.scenarios.find((s) => s.id === p.scenarioId) ?? null : null;
  const persona = p.personas.find((x) => x.id === p.personaId)!;
  const freeTextBlocked = !preset && p.liveAvailable === false;
  const canRun = !p.running && (preset !== null || (p.text.trim().length > 0 && p.liveAvailable === true));

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="presets-h" className="rounded-xl border border-border bg-card">
        <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
          <h2 id="presets-h" className="text-[15px] font-semibold leading-[22px]">
            Recorded tickets
          </h2>
          <p className="text-xs text-muted-foreground">Replayed from live Clocked runs · no credits</p>
        </div>
        <ul className="mt-3 flex flex-col gap-1 px-2 pb-2">
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
                    "group grid w-full grid-cols-[4px_1fr_auto] items-center gap-x-3 rounded-lg px-3 py-2.5 text-left transition-[background,box-shadow] duration-150 ease-out",
                    active ? "bg-surface-sunken shadow-[0_0_0_1px_var(--border)]" : "hover:bg-surface-sunken hover:shadow-sm",
                  )}
                >
                  <span aria-hidden className={cn("h-9 w-1 rounded-full", style.bar)} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium leading-5">{s.title}</span>
                    <span className="block truncate text-[13px] leading-5 text-muted-foreground">{s.text}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", style.pill)}>
                      {style.label}
                    </span>
                    <ArrowUpRight aria-hidden className="hidden size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="ticket-h" className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="ticket-h" className="text-[15px] font-semibold leading-[22px]">
            {preset ? preset.title : "Write your own ticket"}
          </h2>
          {preset ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock aria-hidden className="size-3" /> preset text
            </span>
          ) : null}
        </div>

        <fieldset className="mt-4" disabled={Boolean(preset) || p.running}>
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Employee</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {p.personas.map((x) => {
              const on = x.id === p.personaId;
              return (
                <label
                  key={x.id}
                  className={cn(
                    "flex min-h-11 cursor-pointer flex-col rounded-lg border px-3 py-2 transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    on ? "border-primary bg-accent" : "border-border hover:bg-surface-sunken",
                    preset && !on && "opacity-50",
                  )}
                >
                  <input type="radio" name="persona" value={x.id} checked={on} onChange={() => p.onPersona(x.id)} className="sr-only" />
                  <span className="text-[13px] font-medium leading-5">{x.name}</span>
                  <span className="text-xs leading-[18px] text-muted-foreground">
                    {x.osLabel} · {x.office}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label htmlFor="ticket" className="mb-2 mt-5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Ticket
        </label>
        <textarea
          id="ticket"
          rows={5}
          maxLength={MAX}
          value={preset ? preset.text : p.text}
          readOnly={Boolean(preset)}
          onChange={(e) => p.onText(e.target.value)}
          placeholder="Describe the problem the way an employee would. Personal details are masked before any step reads them."
          className="block w-full resize-y rounded-[10px] border border-input bg-surface-sunken px-3 py-2.5 text-[15px] leading-[22px] placeholder:text-muted-foreground/80 read-only:text-secondary-foreground"
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{persona.device} · {persona.assetTag}</span>
          {!preset ? <span className="tabular">{p.text.length.toLocaleString()} / {MAX.toLocaleString()}</span> : null}
        </div>

        {freeTextBlocked ? (
          <p role="note" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] leading-5 text-warn">
            {p.liveBlocked === "daily_cap"
              ? "Live mode has used today's credit budget, so your own tickets cannot run until midnight UTC. The recorded tickets above replay real runs."
              : "This deployment has no Clocked key, so your own tickets cannot run. The recorded tickets above replay real runs."}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-[18px] text-muted-foreground">
            {preset ? "Replays the recorded live run. Spends no credits." : "Runs live on Clocked (about 30–50 credits)."}
          </p>
          <div className="flex gap-2">
            {preset ? (
              <Button type="button" variant="outline" className="h-11 rounded-lg px-4 sm:h-10" onClick={() => p.onText("")} disabled={p.running}>
                Write my own
              </Button>
            ) : null}
            <Button type="button" className="h-11 rounded-lg px-4 sm:h-10" onClick={p.onRun} disabled={!canRun}>
              {p.running ? "Running…" : preset ? "Replay run" : "Run FixProof"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
