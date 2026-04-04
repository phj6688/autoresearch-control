"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronIcon } from "./icons";

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(
    defaultExpanded ? "auto" : 0
  );
  const reducedMotionRef = useRef(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    // Only update state if it differs from the initial value
    if (mq.matches !== prefersReducedMotion) {
      setPrefersReducedMotion(mq.matches);
    }
    function handler(e: MediaQueryListEvent) {
      reducedMotionRef.current = e.matches;
      setPrefersReducedMotion(e.matches);
    }
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!contentRef.current) return;
    if (expanded) {
      const scrollH = contentRef.current.scrollHeight;
      setHeight(scrollH);
      // After transition, set to auto so it can grow dynamically
      if (!prefersReducedMotion) {
        const timer = setTimeout(() => setHeight("auto"), 200);
        return () => clearTimeout(timer);
      } else {
        setHeight("auto");
      }
    } else {
      // First set to the actual height so transition can animate from it
      if (!prefersReducedMotion) {
        const scrollH = contentRef.current.scrollHeight;
        setHeight(scrollH);
        // Force reflow then set to 0
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setHeight(0);
          });
        });
      } else {
        setHeight(0);
      }
    }
  }, [expanded, prefersReducedMotion]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <div
      className="rounded border"
      style={{
        borderColor: "var(--color-border)",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-white/5"
        style={{ color: "var(--color-text-muted)" }}
      >
        <span
          className="inline-block transition-transform"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transitionDuration: prefersReducedMotion ? "0ms" : "200ms",
          }}
        >
          <ChevronIcon size={12} />
        </span>
        {title}
      </button>
      <div
        ref={contentRef}
        style={{
          height: typeof height === "number" ? `${height}px` : "auto",
          overflow: "hidden",
          transitionProperty: "height",
          transitionDuration: prefersReducedMotion ? "0ms" : "200ms",
          transitionTimingFunction: "ease-in-out",
        }}
      >
        <div className="px-3 pb-3">{children}</div>
      </div>
    </div>
  );
}
