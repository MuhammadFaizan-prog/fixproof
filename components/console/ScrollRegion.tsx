"use client";

import type { ReactNode } from "react";
import { useScrollTabStop } from "@/lib/client/useScrollTabStop";

/** A sideways-scrolling region that is a tab stop only while its content overflows. */
export function ScrollRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const [ref, tabIndex] = useScrollTabStop<HTMLDivElement>(undefined, "x");
  return (
    <div ref={ref} className={className} tabIndex={tabIndex} role="region" aria-label={label} data-scroll-region={tabIndex === 0 ? "scrolls" : "static"}>
      {children}
    </div>
  );
}
