import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** White card with a hairline border, 12px radius and a title row (DESIGN.md R2). */
export function Panel({ title, eyebrow, action, className, children }: PanelProps) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{eyebrow}</p>
          ) : null}
          <h2 className="text-[15px] font-semibold leading-[22px]">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-5 pb-5 pt-4">{children}</div>
    </section>
  );
}
