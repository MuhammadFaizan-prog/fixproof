"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { endpointLabel, recordedLabel, seconds } from "./format";
import type { Row } from "./StageRows";
import { plainText } from "./plain";

/**
 * Step inspector, rebuilt from DESIGN.md R3 (Sentry agent tracing span
 * panel): name + big number + chip, a label/value grid, then
 * Effect / Request / Response tabs on a sunken surface.
 */
export function StepInspector({ row, open, onOpenChange }: { row: Row | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="fp-scroll w-full gap-0 overflow-y-auto border-hairline bg-panel p-0 sm:max-w-[520px] sm:rounded-l-[28px]">
        {row ? <Body row={row} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({ row }: { row: Row }) {
  const m = row.meta;
  const source = !m ? "Computed locally, no Clocked call" : !m.replay ? "Live on Clocked" : m.synthetic ? "Synthetic fixture (documented shape)" : recordedLabel(m.recordedAt);
  const categories = extractCategories(row.detail?.response);
  const kv: [string, React.ReactNode][] = [
    ["Endpoint", row.endpoint === "local" ? "Local (no call)" : `${endpointLabel(row.endpoint)} · /clocked/${row.endpoint === "pipeline" ? "pipeline" : row.endpoint}`],
    ["Step", <code key="s" className="font-mono text-[13px]">{row.id}</code>],
    ["Verdict", plainText(row.verdict ?? row.status)],
    ...(m
      ? ([
          ["Credits", `${m.credits ?? "–"}`],
          ["Model time", m.modelMs != null ? seconds(m.modelMs) : "–"],
          ["Attempts", `${m.attempts}`],
          ["Idempotency key", <code key="k" className="font-mono text-[13px]">{m.idempotencyKeyPrefix}…</code>],
          ["Transport", m.transport ?? "–"],
        ] as [string, React.ReactNode][])
      : []),
    ["Source", source],
  ];

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-hairline px-6 pb-5 pt-6">
        <SheetTitle className="flex items-center gap-2 pr-8 font-sans text-[20px] font-medium leading-7 tracking-[-0.01em]">
          <span className={cn("size-2 shrink-0 rounded-full", row.status === "error" ? "bg-risk-fill" : row.status === "ok" ? "bg-ok-fill" : "bg-neutral")} aria-hidden />
          {row.title}
        </SheetTitle>
        <SheetDescription className="sr-only">Details of one Clocked call in this run</SheetDescription>
        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <span className="tabular text-[32px] font-medium leading-none tracking-[-0.02em]">{m?.credits ?? 0}</span>
          <span className="text-sm text-muted-foreground">credits</span>
          {row.probability !== undefined ? (
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[13px] font-medium text-primary">
              {plainText(row.probabilityLabel ?? "p")} {Math.round(row.probability * 100)}%
            </span>
          ) : null}
        </div>
        <dl className="mt-5 grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-x-4 gap-y-2.5 rounded-2xl border border-hairline bg-card px-4 py-3.5 text-[14px]">
          {kv.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Tabs defaultValue="effect" className="flex-1 px-6 pb-8 pt-4">
        <TabsList variant="line" className="h-9 w-full justify-start gap-4 border-b border-hairline p-0">
          {["effect", "request", "response"].map((t) => (
            <TabsTrigger key={t} value={t} className="h-9 flex-none rounded-none border-0 border-b-2 border-transparent px-0 capitalize data-active:border-primary data-active:text-foreground">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="effect" className="pt-4">
          <p className="text-[15px] leading-[22px]">{plainText(row.effect)}</p>
          {row.error ? <p className="mt-3 rounded-2xl bg-risk-soft px-3 py-2 text-[13px] text-risk">{row.error.message}</p> : null}
          {categories.length ? (
            <div className="mt-5">
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Category breakdown</p>
              <ul className="flex flex-col gap-2">
                {categories.map(([name, p]) => (
                  <li key={name} className="grid grid-cols-[1fr_120px_44px] items-center gap-3 text-[13px]">
                    <span className="truncate">{name}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-track">
                      <span className={cn("fp-bar block h-full rounded-full", /benign/.test(name) ? "bg-ok-fill" : "bg-risk-fill")} style={{ width: `${Math.max(p * 100, 1)}%` }} />
                    </span>
                    <span className="tabular text-right text-muted-foreground">{Math.round(p * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="request" className="pt-4">
          <Json value={row.detail?.request} empty="No request: this row is computed locally." />
        </TabsContent>
        <TabsContent value="response" className="pt-4">
          <Json value={row.detail?.response} empty="No response recorded for this row." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Json({ value, empty }: { value: unknown; empty: string }) {
  if (value === undefined || value === null) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <pre className="fp-scroll max-h-[60vh] overflow-auto rounded-2xl border border-hairline bg-card p-4 font-mono text-[12px] leading-5 text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Guard and Inspect return a category distribution; show the top five (AgentShield's lesson: explain, don't just flag). */
function extractCategories(response: unknown): [string, number][] {
  const find = (o: unknown): Record<string, number> | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    if (r.categories && typeof r.categories === "object") return r.categories as Record<string, number>;
    for (const v of Object.values(r)) {
      const f = find(v);
      if (f) return f;
    }
    return null;
  };
  const c = find(response);
  if (!c) return [];
  return Object.entries(c)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}
