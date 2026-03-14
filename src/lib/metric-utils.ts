import type { MetricDirection } from "./types";

const METRIC_LABELS: Record<string, string> = {
  val_bpb: "BPB",
  f1_pct: "F1",
};

export function metricLabel(metricName: string): string {
  return METRIC_LABELS[metricName] ?? metricName;
}

export function formatMetricValue(
  value: number | null,
  metricName: string
): string {
  if (value === null) return "--";
  if (metricName === "f1_pct") return `${value.toFixed(1)}%`;
  return value.toFixed(4);
}

export function formatDelta(
  delta: number | null,
  metricName: string
): string {
  if (delta === null) return "--";
  const sign = delta > 0 ? "+" : "";
  if (metricName === "f1_pct") return `${sign}${delta.toFixed(1)}%`;
  return `${sign}${delta.toFixed(4)}`;
}

export function isBetter(
  a: number,
  b: number,
  direction: MetricDirection
): boolean {
  return direction === "higher" ? a > b : a < b;
}

export function findBestIndex(
  values: number[],
  direction: MetricDirection
): number {
  if (values.length === 0) return 0;
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (isBetter(values[i], values[best], direction)) best = i;
  }
  return best;
}

export function deltaIsGood(
  delta: number,
  direction: MetricDirection
): boolean {
  return direction === "higher" ? delta > 0 : delta < 0;
}
