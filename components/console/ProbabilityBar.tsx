import { cn } from "@/lib/utils";
import { pct } from "./format";

const BAD_WHEN_HIGH = new Set(["injection", "malicious", "conflict", "escalate"]);

/**
 * Confidence bar: 6 px track, fill grows from 0 on mount (off under reduced
 * motion), crisp label + value on the right. Colour follows what the number
 * means; `handled` marks a bad-when-high signal the run already dealt with.
 */
export function ProbabilityBar({ value, label, className, handled = false, compact = false }: { value: number; label?: string; className?: string; handled?: boolean; compact?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  const bad = label ? BAD_WHEN_HIGH.has(label) : false;
  const tone = bad ? (v >= 0.5 ? (handled ? "bg-warn-fill" : "bg-risk-fill") : "bg-neutral") : v >= 0.7 ? "bg-primary" : v >= 0.45 ? "bg-warn-fill" : "bg-risk-fill";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="meter"
        aria-label={label ? label.replace(/_/g, " ") : "probability"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-track"
      >
        <div className={cn("fp-bar h-full rounded-full", tone)} style={{ width: `${Math.max(v * 100, 1.5)}%` }} />
      </div>
      {compact ? (
        <span className="tabular flex max-w-[96px] shrink-0 items-baseline justify-end gap-1 text-right text-xs">
          {label ? <span className="truncate text-muted-foreground">{label.split("_")[0]}</span> : null}
          <span className="font-semibold">{pct(v)}</span>
        </span>
      ) : label ? (
        <span className="tabular flex w-[132px] shrink-0 items-baseline justify-end gap-1.5 text-right text-xs">
          <span className="truncate text-muted-foreground">{label.replace(/_/g, " ")}</span>
          <span className="font-semibold text-foreground">{pct(v)}</span>
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
    { k: "auto_resolve", v: a, c: "bg-primary", label: "auto-resolve" },
    { k: "suggest", v: s, c: "bg-warn-fill", label: "suggest" },
    { k: "escalate", v: e, c: "bg-risk-fill", label: "escalate" },
  ];
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-track" role="img" aria-label={`Decide: auto-resolve ${pct(a)}, suggest ${pct(s)}, escalate ${pct(e)}`}>
        <div className="fp-bar flex h-full overflow-hidden rounded-full">
          {seg.map((x) => (
            <div key={x.k} className={x.c} style={{ width: `${x.v * 100}%` }} />
          ))}
        </div>
        <span aria-hidden className="absolute -top-1 h-3.5 w-px bg-foreground/70" style={{ left: `${autoMin * 100}%` }} />
        <span aria-hidden className="absolute -top-1 h-3.5 w-px bg-foreground/70" style={{ left: `${(1 - escalateMin) * 100}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {seg.map((x) => (
          <span key={x.k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-1.5 rounded-full", x.c)} />
            {x.label} <span className="tabular font-semibold text-foreground">{pct(x.v)}</span>
          </span>
        ))}
        <span>· auto needs {pct(autoMin)}, escalate {pct(escalateMin)}</span>
      </div>
    </div>
  );
}
