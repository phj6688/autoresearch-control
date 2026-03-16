"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Session, Experiment } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";
import { apiUrl } from "@/lib/base-path";
import { ProgressChart } from "./progress-chart";
import { formatMetricValue, metricLabel, deltaIsGood } from "@/lib/metric-utils";

type SortKey =
  | "tag"
  | "agent_type"
  | "experiment_count"
  | "commit_count"
  | "hit_rate"
  | "best_val_bpb"
  | "delta"
  | "duration";

function computeHitRate(s: Session): number {
  return s.experiment_count > 0
    ? (s.commit_count / s.experiment_count) * 100
    : 0;
}

function computeDuration(s: Session): number {
  if (!s.started_at) return 0;
  const end = s.finished_at ?? Date.now();
  return end - s.started_at;
}

function formatDuration(ms: number): string {
  if (ms === 0) return "--";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ComparisonView() {
  const compareIds = useSessionStore((s) => s.compareIds);
  const sessions = useSessionStore((s) => s.sessions);
  const [sortKey, setSortKey] = useState<SortKey>("best_val_bpb");
  const [sortAsc, setSortAsc] = useState(true);
  const [experimentsBySession, setExperimentsBySession] = useState<
    Record<string, Experiment[]>
  >({});

  const compared = useMemo(
    () => sessions.filter((s) => compareIds.includes(s.id)),
    [sessions, compareIds]
  );

  const fetchExperiments = useCallback(async () => {
    const result: Record<string, Experiment[]> = {};
    await Promise.all(
      compared.map(async (s) => {
        try {
          const res = await fetch(apiUrl(`/api/sessions/${s.id}/experiments?limit=2000`));
          if (res.ok) {
            const data = (await res.json()) as {
              experiments: Experiment[];
              total: number;
            };
            result[s.id] = data.experiments;
          }
        } catch {
          result[s.id] = [];
        }
      })
    );
    setExperimentsBySession(result);
  }, [compared]);

  useEffect(() => {
    if (compared.length > 0) {
      void fetchExperiments();
    }
  }, [compared.length, fetchExperiments]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = useMemo(() => {
    return [...compared].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "tag":
          cmp = a.tag.localeCompare(b.tag);
          break;
        case "agent_type":
          cmp = a.agent_type.localeCompare(b.agent_type);
          break;
        case "experiment_count":
          cmp = a.experiment_count - b.experiment_count;
          break;
        case "commit_count":
          cmp = a.commit_count - b.commit_count;
          break;
        case "hit_rate":
          cmp = computeHitRate(a) - computeHitRate(b);
          break;
        case "best_val_bpb":
          cmp = (a.best_val_bpb ?? 999) - (b.best_val_bpb ?? 999);
          break;
        case "delta":
          cmp = ((a.best_val_bpb ?? 0.998) - 0.998) - ((b.best_val_bpb ?? 0.998) - 0.998);
          break;
        case "duration":
          cmp = computeDuration(a) - computeDuration(b);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [compared, sortKey, sortAsc]);

  if (compareIds.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div
          className="text-lg font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Session Comparison
        </div>
        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Toggle sessions with ◆ in the sidebar to compare
        </div>
      </div>
    );
  }

  const primaryMetric = compared[0]?.metric_name ?? "val_bpb";
  const primaryDirection = compared[0]?.metric_direction ?? "lower";
  const hasMixedMetrics = compared.some(
    (s) => s.metric_name !== primaryMetric || s.metric_direction !== primaryDirection
  );

  const headers: Array<{ key: SortKey; label: string }> = [
    { key: "tag", label: "Session" },
    { key: "agent_type", label: "Agent" },
    { key: "experiment_count", label: "Experiments" },
    { key: "commit_count", label: "Commits" },
    { key: "hit_rate", label: "Hit Rate" },
    { key: "best_val_bpb", label: `Best ${metricLabel(primaryMetric)}` },
    { key: "delta", label: "Δ Best" },
    { key: "duration", label: "Duration" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2
          className="text-lg font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-primary)" }}
        >
          Session Comparison
        </h2>
        <span
          className="rounded px-2 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: "var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          {compareIds.length} sessions
        </span>
      </div>

      {hasMixedMetrics && (
        <div
          className="rounded border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--color-warning)",
            backgroundColor: "rgba(251, 191, 36, 0.08)",
            color: "var(--color-warning)",
          }}
        >
          Sessions use different metrics or optimization directions. Comparison values may not be directly comparable.
        </div>
      )}

      <ProgressChart
        sessions={compared}
        experimentsBySession={experimentsBySession}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderColor: "var(--color-border)" }} className="border-b">
              {headers.map((h) => (
                <th
                  key={h.key}
                  className="cursor-pointer px-3 py-2 text-left font-semibold uppercase tracking-wider transition-colors hover:text-[var(--color-accent)]"
                  style={{
                    color:
                      sortKey === h.key
                        ? "var(--color-accent)"
                        : "var(--color-text-muted)",
                  }}
                  onClick={() => handleSort(h.key)}
                >
                  {h.label}
                  {sortKey === h.key && (sortAsc ? " ↑" : " ↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const firstExp = experimentsBySession[s.id]?.[0];
              const baseline = firstExp?.val_bpb ?? null;
              const delta = s.best_val_bpb !== null && baseline !== null
                ? s.best_val_bpb - baseline
                : null;
              return (
                <tr
                  key={s.id}
                  className="border-b transition-colors"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <td
                    className="px-3 py-2 font-bold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {s.tag}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {s.agent_type}
                  </td>
                  <td
                    className="px-3 py-2 tabular-nums"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {s.experiment_count}
                  </td>
                  <td
                    className="px-3 py-2 tabular-nums"
                    style={{ color: "var(--color-success)" }}
                  >
                    {s.commit_count}
                  </td>
                  <td
                    className="px-3 py-2 tabular-nums"
                    style={{ color: "var(--color-warning)" }}
                  >
                    {computeHitRate(s).toFixed(0)}%
                  </td>
                  <td
                    className="px-3 py-2 font-bold tabular-nums"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {formatMetricValue(s.best_val_bpb, s.metric_name)}
                  </td>
                  <td
                    className="px-3 py-2 tabular-nums"
                    style={{
                      color:
                        delta !== null && deltaIsGood(delta, primaryDirection)
                          ? "var(--color-success)"
                          : "var(--color-text-muted)",
                    }}
                  >
                    {delta !== null
                      ? `${delta > 0 ? "+" : ""}${s.metric_name === "f1_pct" ? delta.toFixed(1) + "%" : delta.toFixed(4)}`
                      : "--"}
                  </td>
                  <td
                    className="px-3 py-2 tabular-nums"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {formatDuration(computeDuration(s))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
