"use client";

import { useCallback, useState } from "react";
import type { Session, Experiment } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";
import { apiUrl } from "@/lib/base-path";
import { StatusBadge } from "./status-badge";
import { ExperimentTimeline } from "./experiment-timeline";
import { CommitFeed } from "./commit-feed";
import { CodeHeatmap } from "./code-heatmap";
import { PauseIcon, PlayIcon, StopIcon, ForkIcon } from "./icons";
import { ActivityPanel } from "./activity-panel";
import { useActivityPoll } from "@/hooks/use-activity-poll";
import { formatMetricValue, formatDelta, metricLabel } from "@/lib/metric-utils";

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) return "--";
  const ms = Math.max(0, Date.now() - startedAt);
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const AGENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  aider: "Aider",
  "gemini-cli": "Gemini CLI",
};

interface SessionDetailProps {
  session: Session;
  experiments: Experiment[];
  onFork?: (session: Session) => void;
}

export function SessionDetail({ session, experiments, onFork }: SessionDetailProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const updateSessionStatus = useSessionStore((s) => s.updateSessionStatus);
  const { activity, error: activityError } = useActivityPoll(
    session.id,
    session.status
  );

  const handleAction = useCallback(
    async (action: "pause" | "resume" | "kill") => {
      if (action === "kill") {
        const confirmed = window.confirm(
          `Kill session "${session.tag}"? The worktree will be preserved.`
        );
        if (!confirmed) return;
      }

      setLoading(action);
      try {
        const res = await fetch(apiUrl(`/api/sessions/${session.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          const data = (await res.json()) as Session;
          updateSessionStatus(session.id, data.status);
        }
      } finally {
        setLoading(null);
      }
    },
    [session.id, session.tag, updateSessionStatus]
  );

  const committed = experiments.filter((e) => e.committed !== 0);
  const hitRate =
    experiments.length > 0
      ? ((committed.length / experiments.length) * 100).toFixed(0)
      : "0";

  const avgDelta =
    committed.length > 0
      ? committed.reduce((s, e) => s + (e.delta ?? 0), 0) / committed.length
      : 0;

  const elapsedMs = session.started_at
    ? (session.finished_at ?? Date.now()) - session.started_at
    : 0;
  const elapsedHours = elapsedMs / 3600000;
  const velocity =
    elapsedHours > 0 && experiments.length > 0
      ? (experiments.length / elapsedHours).toFixed(1)
      : null;

  const metrics = [
    {
      label: `BEST ${metricLabel(session.metric_name)}`,
      value: formatMetricValue(session.best_val_bpb, session.metric_name),
      color: "var(--color-accent)",
      large: true,
    },
    {
      label: "EXPERIMENTS",
      value: String(experiments.length),
      color: "var(--color-text-primary)",
      large: false,
    },
    {
      label: "COMMITTED",
      value: String(committed.length),
      color: "var(--color-success)",
      large: false,
    },
    {
      label: "HIT RATE",
      value: `${hitRate}%`,
      color: "var(--color-warning)",
      large: false,
    },
    {
      label: "AVG DELTA",
      value: avgDelta !== 0 ? formatDelta(avgDelta, session.metric_name) : "--",
      color: "var(--color-purple)",
      large: false,
    },
    {
      label: "VELOCITY",
      value: velocity ? `${velocity}/hr` : "--",
      color: "var(--color-text-secondary)",
      large: false,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2
          className="text-xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {session.tag}
        </h2>
        <StatusBadge status={session.status} />
        <span
          className="text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {AGENT_NAMES[session.agent_type] ?? session.agent_type}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: "rgba(167, 139, 250, 0.15)",
            color: "var(--color-purple)",
          }}
        >
          {session.branch}
        </span>
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--color-text-muted)" }}
        >
          {formatElapsed(session.started_at)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {session.status === "running" && (
            <button
              disabled={loading !== null}
              onClick={() => void handleAction("pause")}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-status-paused-bg)",
                color: "var(--color-status-paused-text)",
              }}
            >
              <PauseIcon size={12} />
              {loading === "pause" ? "..." : "Pause"}
            </button>
          )}
          {session.status === "paused" && (
            <button
              disabled={loading !== null}
              onClick={() => void handleAction("resume")}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-status-running-bg)",
                color: "var(--color-status-running-text)",
              }}
            >
              <PlayIcon size={12} />
              {loading === "resume" ? "..." : "Resume"}
            </button>
          )}
          {(session.status === "running" || session.status === "paused") && (
            <button
              disabled={loading !== null}
              onClick={() => void handleAction("kill")}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-status-failed-bg)",
                color: "var(--color-status-failed-text)",
              }}
            >
              <StopIcon size={12} />
              {loading === "kill" ? "..." : "Kill"}
            </button>
          )}
          {experiments.length > 0 && (
            <button
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
              onClick={() => onFork?.(session)}
              title="Fork this session into a new session"
            >
              <ForkIcon size={12} />
              Fork
            </button>
          )}
        </div>
      </div>

      {/* Strategy */}
      <div
        className="rounded border p-3 text-xs leading-relaxed"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-secondary)",
        }}
      >
        {session.strategy}
      </div>

      {/* Live Activity */}
      {(session.status === "running" || session.status === "paused") && (
        <ActivityPanel
          activity={activity}
          error={activityError}
          isRunning={session.status === "running"}
        />
      )}

      {/* Metrics Row */}
      <div className="flex flex-wrap gap-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex-1 rounded border p-3"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              minWidth: "120px",
            }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              {m.label}
            </div>
            <div
              className={`mt-1 font-bold tabular-nums ${m.large ? "text-2xl" : "text-lg"}`}
              style={{ color: m.color }}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Experiment Timeline */}
      <div>
        <div
          className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Experiment Timeline
        </div>
        <ExperimentTimeline experiments={experiments} metricDirection={session.metric_direction} metricName={session.metric_name} />
      </div>

      {/* Commit Feed + Heatmap */}
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <CommitFeed experiments={experiments} />
        </div>
        <div className="w-[260px] shrink-0">
          <CodeHeatmap experiments={experiments} />
        </div>
      </div>

      {/* Cross-pollinate hint */}
      {experiments.length > 0 && (
        <div
          className="flex items-center gap-3 rounded border border-dashed p-3"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          <ForkIcon size={20} />
          <div className="text-xs">
            <span className="font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Cross-pollinate:
            </span>{" "}
            Fork this session&apos;s best train.py into a new session with a different strategy to explore alternative directions.
          </div>
        </div>
      )}
    </div>
  );
}
