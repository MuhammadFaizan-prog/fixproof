"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * A scroll container is a tab stop only while it actually scrolls (WCAG
 * scrollable-region-focusable), so keyboard users never land on a static aside.
 * Returns the ref to attach and the tabIndex to render: 0 while it overflows,
 * otherwise `idle` (undefined = no tab stop, -1 = programmatic focus only).
 */
export function useScrollTabStop<T extends HTMLElement>(idle: -1 | undefined = undefined, axis: "y" | "x" = "y"): [RefObject<T | null>, 0 | -1 | undefined] {
  const ref = useRef<T>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const overflow = getComputedStyle(el)[axis === "y" ? "overflowY" : "overflowX"];
      const canScroll = overflow === "auto" || overflow === "scroll";
      const more = axis === "y" ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
      setScrolls(canScroll && more);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    const mo = new MutationObserver(() => {
      for (const c of Array.from(el.children)) ro.observe(c);
      check();
    });
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [axis]);
  return [ref, scrolls ? 0 : idle];
}

/** Marks <html data-hydrated> once the client has hydrated, so tests (and nothing else) can wait for it. */
export function useHydratedMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);
}
