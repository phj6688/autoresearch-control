"use client";

import { useEffect, useRef } from "react";
import type { Experiment, MetricDirection } from "@/lib/types";
import { findBestIndex, formatMetricValue, formatDelta } from "@/lib/metric-utils";

interface ExperimentTimelineProps {
  experiments: Experiment[];
  compact?: boolean;
  metricDirection?: MetricDirection;
  metricName?: string;
}

export function ExperimentTimeline({
  experiments,
  compact = false,
  metricDirection = "lower",
  metricName = "val_bpb",
}: ExperimentTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (experiments.length > prevLenRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
      });
    }
    prevLenRef.current = experiments.length;
  }, [experiments.length]);

  if (experiments.length === 0) {
    return (
      <div
        className="flex h-16 items-center justify-center rounded border text-xs"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        No experiments yet
      </div>
    );
  }

  const spacing = compact ? 8 : 14;
  const rCommitted = compact ? 3 : 5;
  const rDiscarded = compact ? 2 : 3;
  const padY = 12;
  const height = compact ? 48 : 72;
  const width = Math.max(experiments.length * spacing + 40, 200);

  const values = experiments.map((e) => e.val_bpb);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.001;

  const scaleY = (v: number) =>
    padY + ((v - min) / range) * (height - padY * 2);

  const bestIdx = findBestIndex(
    experiments.map((e) => e.val_bpb),
    metricDirection
  );

  return (
    <div>
      <div
        ref={scrollRef}
        className="overflow-x-auto rounded border"
        style={{ borderColor: "var(--color-border)" }}
      >
        <svg
          width={width}
          height={height}
          style={{ display: "block", minWidth: width }}
        >
          {experiments.map((exp, i) => {
            const x = 20 + i * spacing;
            const y = scaleY(exp.val_bpb);
            const isCommitted = exp.committed !== 0;
            const isBest = i === bestIdx;

            const tooltip = `Run #${exp.run_number} · ${formatMetricValue(exp.val_bpb, metricName)}${exp.delta !== null ? ` · ${formatDelta(exp.delta, metricName)}` : ""} · ${isCommitted ? "committed" : "discarded"}`;

            return (
              <g key={exp.id ?? i}>
                <circle
                  cx={x}
                  cy={y}
                  r={isCommitted ? rCommitted : rDiscarded}
                  fill={
                    isCommitted
                      ? "var(--color-accent)"
                      : "#334155"
                  }
                  opacity={isCommitted ? 1 : 0.6}
                >
                  <title>{tooltip}</title>
                </circle>
                {isBest && (
                  <circle
                    cx={x}
                    cy={y}
                    r={rCommitted + 3}
                    fill="none"
                    stroke="var(--color-warning)"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {!compact && (
        <div
          className="mt-1.5 flex items-center gap-4 text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          <span className="flex items-center gap-1">
            <svg width={8} height={8}>
              <circle cx={4} cy={4} r={3} fill="var(--color-accent)" />
            </svg>
            committed
          </span>
          <span className="flex items-center gap-1">
            <svg width={8} height={8}>
              <circle cx={4} cy={4} r={3} fill="#334155" />
            </svg>
            discarded
          </span>
          <span className="flex items-center gap-1">
            <svg width={12} height={12}>
              <circle
                cx={6}
                cy={6}
                r={5}
                fill="none"
                stroke="var(--color-warning)"
                strokeWidth={1.5}
              />
            </svg>
            best
          </span>
        </div>
      )}
    </div>
  );
}
