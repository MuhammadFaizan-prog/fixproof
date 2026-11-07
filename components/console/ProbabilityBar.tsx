import { cn } from "@/lib/utils";
import { pct } from "./format";

const BAD_WHEN_HIGH = new Set(["injection", "malicious", "conflict", "escalate"]);

/** Merit's 4 px progress bar, used for a Clocked probability. Colour follows what the number means. */
export function ProbabilityBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const bad = label ? BAD_WHEN_HIGH.has(label) : false;
  const tone = bad ? (v >= 0.5 ? "bg-risk" : "bg-muted-foreground/40") : v >= 0.7 ? "bg-ok" : v >= 0.45 ? "bg-warn" : "bg-risk";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="meter"
        aria-label={label ?? "probability"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        className="h-1 flex-1 overflow-hidden rounded-full bg-track"
      >
        <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", tone)} style={{ width: `${Math.max(v * 100, 1.5)}%` }} />
      </div>
      {label ? (
        <span className="tabular w-[124px] shrink-0 truncate text-right text-xs text-muted-foreground">
          {label.replace(/_/g, " ")} {pct(v)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Decide's full distribution with the policy thresholds drawn on it: the
 * human-review band is visible, not hidden behind a label.
 */
export function BandBar({ probabilities, autoMin, escalateMin }: { probabilities: Record<string, number>; autoMin: number; escalateMin: number }) {
  const a = probabilities.auto_resolve ?? 0;
  const s = probabilities.suggest ?? 0;
  const e = probabilities.escalate ?? 0;
  const seg = [
    { k: "auto_resolve", v: a, c: "bg-ok", label: "auto-resolve" },
    { k: "suggest", v: s, c: "bg-warn", label: "suggest" },
    { k: "escalate", v: e, c: "bg-risk", label: "escalate" },
  ];
  return (
    <div>
      <div className="relative h-1.5 overflow-visible rounded-full bg-track" role="img" aria-label={`Decide: auto-resolve ${pct(a)}, suggest ${pct(s)}, escalate ${pct(e)}`}>
        <div className="flex h-full overflow-hidden rounded-full">
          {seg.map((x) => (
            <div key={x.k} className={x.c} style={{ width: `${x.v * 100}%` }} />
          ))}
        </div>
        <span aria-hidden className="absolute -top-1 h-3.5 w-px bg-foreground/70" style={{ left: `${autoMin * 100}%` }} />
        <span aria-hidden className="absolute -top-1 h-3.5 w-px bg-foreground/70" style={{ left: `${(1 - escalateMin) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {seg.map((x) => (
          <span key={x.k} className="inline-flex items-center gap-1">
            <span aria-hidden className={cn("size-1.5 rounded-full", x.c)} />
            {x.label} <span className="tabular text-foreground">{pct(x.v)}</span>
          </span>
        ))}
        <span>· auto needs {pct(autoMin)}, escalate {pct(escalateMin)}</span>
      </div>
    </div>
  );
}
