import { cn } from "@/lib/utils";

/**
 * Building blocks for direction D (docs/DESIGN.md, measured from the
 * OrchestrateIQ shot at 1x): 28 px panels on the cool-grey canvas, list rows
 * as separate white 18 px boxes, 12 px uppercase labels, pill chips.
 */

/** Large panel: 28 px radius, near-white fill, hairline border, no shadow. */
export function Panel({ className, children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section {...rest} className={cn("rounded-[28px] border border-hairline bg-panel", className)}>
      {children}
    </section>
  );
}

/** One list row: white 18 px box with a hairline, the D table-row treatment. */
export function RowBox({ className, children, ...rest }: React.ComponentProps<"div">) {
  return (
    <div {...rest} className={cn("rounded-[18px] border border-hairline bg-card", className)}>
      {children}
    </div>
  );
}

/** Uppercase section label: 12/16, 500, tracking 0.06em, muted ink. */
export function Eyebrow({ className, children, as: Tag = "p", ...rest }: { as?: "p" | "h2" | "h3" | "span" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag {...rest} className={cn("text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-muted-foreground", className)}>
      {children}
    </Tag>
  );
}

type Tone = "neutral" | "ok" | "warn" | "risk" | "primary" | "violet";
const TONES: Record<Tone, string> = {
  neutral: "border-hairline bg-card text-muted-foreground",
  ok: "border-transparent bg-ok-soft text-ok",
  warn: "border-transparent bg-warn-soft text-warn",
  risk: "border-transparent bg-risk-soft text-risk",
  primary: "border-transparent bg-primary-soft text-primary",
  violet: "border-transparent bg-violet-soft text-violet",
};

/** Pill chip (26 px, 13 px/500). Optional lucide icon. */
export function Chip({ icon: Icon, children, className, tone = "neutral" }: { icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; children: React.ReactNode; className?: string; tone?: Tone }) {
  return (
    <span className={cn("tabular inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[13px] font-medium", TONES[tone], className)}>
      {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
      {children}
    </span>
  );
}

/** Status chip with a leading dot (D's "Context complete" chip). */
export function StatusPill({ dot, className, children }: { dot: string; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-[30px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[14px] font-medium", className)}>
      <span aria-hidden className={cn("size-2 rounded-full", dot)} />
      {children}
    </span>
  );
}

/** Callout pill: tinted, rounded-full on one line, 15 px text with a leading icon. */
const CALLOUT: Record<"ok" | "warn" | "risk" | "primary", string> = {
  ok: "bg-ok-tint text-ok",
  warn: "bg-warn-soft text-warn",
  risk: "bg-risk-soft text-risk",
  primary: "bg-primary-soft text-primary",
};
export function Callout({ tone, icon: Icon, children, className }: { tone: "ok" | "warn" | "risk" | "primary"; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2.5 rounded-[20px] px-4 py-2.5 text-[14px] leading-5", CALLOUT[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Stat tile from the rail: 16 px box, 14 px label over a 24 px value. */
export function StatTile({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-hairline bg-card px-4 py-3", className)}>
      <p className="text-[13px] leading-[18px] text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-[24px] font-medium leading-[30px] tracking-[-0.01em]">{value}</p>
    </div>
  );
}
