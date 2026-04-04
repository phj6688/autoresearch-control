"use client";

import { useCallback, useRef, useState } from "react";
import type { Experiment, MetricDirection } from "@/lib/types";
import { findBestIndex, formatMetricValue } from "@/lib/metric-utils";
import { useSessionStore } from "@/stores/session-store";

interface TooltipData {
  x: number;
  y: number;
  experiment: Experiment;
  index: number;
  isBest: boolean;
}

interface SparklineProps {
  data: Experiment[];
  width?: number;
  height?: number;
  color?: string;
  showBest?: boolean;
  metricDirection?: MetricDirection;
  metricName?: string;
  interactive?: boolean;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "var(--color-accent)",
  showBest = true,
  metricDirection = "lower",
  metricName = "val_bpb",
  interactive = true,
}: SparklineProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectSession = useSessionStore((s) => s.selectSession);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (exp: Experiment) => {
      if (!interactive) return;
      selectSession(exp.session_id);
    },
    [interactive, selectSession]
  );

  if (data.length === 0) {
    return (
      <svg width={width} height={height}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-border)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const values = data.map((d) => d.val_bpb);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.001;

  const scaleX = (i: number) => pad + (i / Math.max(data.length - 1, 1)) * w;
  const scaleY = metricDirection === "higher"
    ? (v: number) => pad + ((max - v) / range) * h
    : (v: number) => pad + ((v - min) / range) * h;

  const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.val_bpb)}`).join(" ");

  const bestIdx = findBestIndex(
    data.map((d) => d.val_bpb),
    metricDirection
  );

  const tooltipAbove = tooltip ? tooltip.y > 20 : true;

  return (
    <div ref={wrapperRef} className="relative" style={{ width, height }}>
      <svg width={width} height={height}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const isBest = i === bestIdx;
          const cx = scaleX(i);
          const cy = scaleY(d.val_bpb);
          return (
            <g key={d.id ?? i}>
              {showBest && isBest && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill="none"
                  stroke="var(--color-warning)"
                  strokeWidth={1.5}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={
                  interactive && tooltip?.index === i
                    ? 3.5
                    : isBest
                      ? 3
                      : d.committed
                        ? 2
                        : 1.5
                }
                fill={d.committed ? color : "var(--color-text-muted)"}
                opacity={d.committed ? 1 : 0.5}
                style={interactive ? { cursor: "pointer" } : undefined}
                onMouseEnter={() => {
                  if (!interactive) return;
                  setTooltip({ x: cx, y: cy, experiment: d, index: i, isBest: i === bestIdx });
                }}
                onMouseLeave={handleMouseLeave}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick(d);
                }}
              />
            </g>
          );
        })}
      </svg>

      {interactive && tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded border px-2 py-1 text-xs whitespace-nowrap"
          style={{
            left: Math.max(0, Math.min(tooltip.x - 60, width - 120)),
            top: tooltipAbove ? tooltip.y - 40 : tooltip.y + 10,
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border)",
            color: "var(--color-text-primary)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          <span className="font-semibold" style={{ color: "var(--color-accent)" }}>
            {formatMetricValue(tooltip.experiment.val_bpb, metricName)}
          </span>
          <span style={{ color: "var(--color-text-muted)" }}>
            {" "}· Run #{tooltip.experiment.run_number}
          </span>
          <span style={{ color: tooltip.experiment.committed ? "var(--color-success)" : "var(--color-text-muted)" }}>
            {" "}· {tooltip.experiment.committed ? "committed" : "discarded"}
          </span>
          {tooltip.experiment.created_at && (
            <span style={{ color: "var(--color-text-muted)" }}>
              {" "}· {new Date(tooltip.experiment.created_at).toLocaleTimeString()}
            </span>
          )}
          {tooltip.isBest && (
            <span style={{ color: "var(--color-warning)" }}> ★</span>
          )}
        </div>
      )}
    </div>
  );
}
