import type { HistoryEntry } from "@/lib/client/history";
import type { Scenario } from "@/data/scenarios";
import { cn } from "@/lib/utils";
import { OUTCOME_STYLE } from "./outcome-style";
import { Eyebrow, Panel } from "./primitives";

/** D's recent-runs list: plain rows, a coloured dot per outcome, tabular numbers. Masked text only, this browser only. */
export function RecentRuns({ history, scenarios }: { history: HistoryEntry[]; scenarios: Scenario[] }) {
  const rows = history.slice(0, 6);
  const title = (h: HistoryEntry) => (h.scenarioId ? (scenarios.find((s) => s.id === h.scenarioId)?.title ?? h.scenarioId) : h.maskedText);
  return (
    <Panel aria-labelledby="runs-h" className="px-5 pb-4 pt-5 sm:px-7">
      <Eyebrow as="h2" id="runs-h">
        Recent runs · this browser
      </Eyebrow>
      {rows.length ? (
        <ul className="mt-2">
          {rows.map((h) => {
            const st = OUTCOME_STYLE[h.outcome];
            const t = new Date(h.createdAt);
            return (
              <li key={h.id} className="grid grid-cols-[minmax(0,1fr)_110px_64px_52px] items-center gap-x-3 py-2 text-[14px] leading-5 sm:grid-cols-[minmax(0,1fr)_130px_80px_60px]">
                <span className="truncate font-mono text-[13px]">{h.scenarioId ?? "custom"} <span className="font-sans text-muted-foreground">· {title(h)}</span></span>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className={cn("size-2 rounded-full", st.dot)} />
                  {st.label}
                </span>
                <span className="tabular text-right text-muted-foreground">{h.credits} cr</span>
                <span className="tabular text-right text-muted-foreground">{Number.isNaN(t.getTime()) ? "–" : t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[14px] text-muted-foreground">No runs yet in this browser. Each replay is listed here with its masked text only.</p>
      )}
    </Panel>
  );
}
