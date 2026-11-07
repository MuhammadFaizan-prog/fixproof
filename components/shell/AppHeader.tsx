import { Badge } from "@/components/ui/badge";

interface AppHeaderProps {
  mode: "replay" | "live";
  sessionCredits: number;
}

export function AppHeader({ mode, sessionCredits }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-md bg-primary font-mono text-[13px] font-semibold text-primary-foreground"
          >
            FP
          </span>
          <span className="text-[15px] font-semibold tracking-tight">FixProof</span>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground md:flex">
            <span aria-hidden className="text-border">/</span>
            <span className="truncate">Northwind Labs</span>
            <span aria-hidden className="text-border">/</span>
            <span className="truncate">Service desk</span>
            <span aria-hidden className="text-border">/</span>
            <span className="truncate font-medium text-foreground">New ticket</span>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className="h-7 rounded-full border-border bg-surface-sunken px-2.5 text-xs font-medium text-secondary-foreground"
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${mode === "live" ? "bg-ok" : "bg-warn"}`}
            />
            {mode === "live" ? "Live on Clocked" : "Replay"}
          </Badge>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            <span className="tabular font-medium text-foreground">{sessionCredits}</span> credits this session
          </span>
        </div>
      </div>
    </header>
  );
}
