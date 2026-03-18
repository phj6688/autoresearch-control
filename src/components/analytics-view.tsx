"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/base-path";
import { StatusBadge } from "./status-badge";
import { formatMetricValue, metricLabel } from "@/lib/metric-utils";
import type { SessionStatus, MetricDirection } from "@/lib/types";

interface SessionHealth {
  id: string;
  tag: string;
  status: SessionStatus;
  healthy: boolean;
  experiment_count: number;
  best_val_bpb: number | null;
  metric_name: string;
  metric_direction: MetricDirection;
  restart_count: number;
  last_restart_at: number | null;
}

interface HealthStatus {
  sessions: SessionHealth[];
  summary: {
    healthy: number;
    unhealthy: number;
    total_restarts: number;
  };
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return "--";
  const ms = Math.max(0, Date.now() - ts);
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AnalyticsView() {
  const [data, setData] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/health/status"));
      if (res.ok) {
        const result = (await res.json()) as HealthStatus;
        setData(result);
        setError(null);
      } else {
        setError(`Failed to fetch health status (${res.status})`);
      }
    } catch {
      setError("Network error fetching health status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => {
      void fetchHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="h-3 w-48 rounded"
          style={{
            backgroundColor: "var(--color-border)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: "var(--color-error)" }}
      >
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const summaryCards = [
    {
      label: "HEALTHY SESSIONS",
      value: String(data.summary.healthy),
      color: "var(--color-success)",
    },
    {
      label: "UNHEALTHY SESSIONS",
      value: String(data.summary.unhealthy),
      color: data.summary.unhealthy > 0 ? "var(--color-error)" : "var(--color-text-muted)",
    },
    {
      label: "TOTAL AUTO-RESTARTS",
      value: String(data.summary.total_restarts),
      color: data.summary.total_restarts > 0 ? "var(--color-warning)" : "var(--color-text-muted)",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              {card.label}
            </div>
            <div
              className="mt-1 text-2xl font-bold tabular-nums"
              style={{ color: card.color }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Session health cards grid */}
      {data.sessions.length === 0 ? (
        <div
          className="py-8 text-center text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          No active sessions
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.sessions.map((session) => (
            <div
              key={session.id}
              className="rounded border p-4"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {/* Health dot */}
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: session.healthy
                        ? "var(--color-success)"
                        : "var(--color-error)",
                    }}
                  />
                  <span
                    className="truncate text-sm font-bold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {session.tag}
                  </span>
                </div>
                <StatusBadge status={session.status} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <div>
                  <span style={{ color: "var(--color-text-muted)" }}>EXPERIMENTS </span>
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {session.experiment_count}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--color-text-muted)" }}>
                    BEST {metricLabel(session.metric_name)}{" "}
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {formatMetricValue(session.best_val_bpb, session.metric_name)}
                  </span>
                </div>
              </div>

              {session.restart_count > 0 && (
                <div
                  className="mt-2 flex items-center gap-2 text-xs"
                  style={{ color: "var(--color-warning)" }}
                >
                  <span>
                    ↻ {session.restart_count} restart{session.restart_count > 1 ? "s" : ""}
                  </span>
                  <span style={{ color: "var(--color-text-muted)" }}>
                    last {formatRelativeTime(session.last_restart_at)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
