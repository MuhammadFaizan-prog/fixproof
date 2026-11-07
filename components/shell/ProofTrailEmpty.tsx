import { STAGES } from "@/data/pipeline";

/** Proof Trail before any ticket: the run, step by step, in the Merit run-trace style (DESIGN.md R1). */
export function ProofTrailEmpty() {
  return (
    <div>
      <h1 className="font-heading text-[30px] leading-[36px] tracking-[-0.01em]">
        No ticket yet.
        <br />
        Eight checks are waiting.
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Every step below is a Clocked call. Each one shows what it changed, what it cost, and the evidence behind it.
      </p>
      <ol className="mt-5 divide-y divide-border rounded-xl border border-border bg-card px-5">
        {STAGES.map((stage, i) => (
          <li key={stage.id} className="grid grid-cols-[40px_1fr] gap-x-4 py-4">
            <span className="tabular pt-0.5 text-right text-[22px] font-semibold leading-none text-muted-foreground/60">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-semibold leading-[22px]">{stage.title}</h3>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                  {stage.endpoints.join(" · ")}
                </span>
              </div>
              <p className="mt-0.5 text-sm leading-[20px] text-muted-foreground">{stage.promise}</p>
              <div className="mt-3 h-1 rounded-full bg-track" aria-hidden />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
