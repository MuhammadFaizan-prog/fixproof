"use client";

import { Coins, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  mode: "replay" | "live";
  sessionCredits: number;
}

const SECTIONS = [
  { id: "queue", label: "Tickets" },
  { id: "trace", label: "Proof trail" },
  { id: "evidence", label: "Evidence" },
] as const;

/**
 * Top bar as floating white pills on the canvas (D): name pill left, section
 * pill centre (real in-page anchors, not fake destinations), mode + credits
 * right. No blur.
 */
export function AppHeader({ mode, sessionCredits }: AppHeaderProps) {
  const [active, setActive] = useState<string>("trace");
  return (
    <header className="sticky top-0 z-30 shrink-0 bg-background xl:static">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-3 py-3 sm:px-5 xl:py-4">
        <div className="flex h-12 items-center gap-2.5 rounded-full border border-hairline bg-card pl-1.5 pr-4 sm:h-14 sm:pl-2 sm:pr-5">
          <span aria-hidden className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary sm:size-10">
            <ShieldCheck className="size-[18px]" strokeWidth={2.25} />
          </span>
          <span className="text-[16px] font-medium tracking-[-0.01em] sm:text-[17px]">FixProof</span>
        </div>

        <nav aria-label="Sections" className="hidden h-14 items-center gap-1 rounded-full border border-hairline bg-card p-1.5 md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActive(s.id)}
              aria-current={active === s.id ? "location" : undefined}
              className={cn(
                "flex h-11 items-center rounded-full px-5 text-[15px] transition-colors duration-150",
                active === s.id ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-secondary",
              )}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex h-12 items-center gap-1.5 rounded-full border border-hairline bg-card p-1.5 sm:h-14">
          <span className={cn("inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium sm:h-11", mode === "live" ? "bg-ok-soft text-ok" : "bg-primary-soft text-primary")}>
            <span aria-hidden className={cn("size-2 rounded-full", mode === "live" ? "bg-ok-fill" : "bg-primary")} />
            {mode === "live" ? "Live" : "Replay"}
          </span>
          <span className="hidden h-11 items-center gap-2 px-3 text-[14px] text-muted-foreground sm:inline-flex">
            <Coins aria-hidden className="size-4" />
            <span className="tabular font-medium text-foreground">{sessionCredits}</span> credits this session
          </span>
        </div>
      </div>
    </header>
  );
}
