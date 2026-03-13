"use client";

import type { Experiment } from "@/lib/types";

interface SparklineProps {
  data: Experiment[];
  width?: number;
  height?: number;
  color?: string;
  showBest?: boolean;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "var(--color-accent)",
  showBest = true,
}: SparklineProps) {
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
  const scaleY = (v: number) => pad + ((max - v) / range) * h;

  const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.val_bpb)}`).join(" ");

  let bestIdx = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].val_bpb < data[bestIdx].val_bpb) bestIdx = i;
  }

  return (
    <svg width={width} height={height}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle
          key={d.id ?? i}
          cx={scaleX(i)}
          cy={scaleY(d.val_bpb)}
          r={d.committed ? 2 : 1.5}
          fill={d.committed ? color : "var(--color-text-muted)"}
          opacity={d.committed ? 1 : 0.5}
        />
      ))}
      {showBest && (
        <circle
          cx={scaleX(bestIdx)}
          cy={scaleY(data[bestIdx].val_bpb)}
          r={4}
          fill="none"
          stroke="var(--color-warning)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
