"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, Experiment } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";
import { apiUrl } from "@/lib/base-path";
import { StatusBadge } from "./status-badge";
import { ExperimentTimeline } from "./experiment-timeline";
import { CommitFeed } from "./commit-feed";
import { CodeHeatmap } from "./code-heatmap";
import { PauseIcon, PlayIcon, StopIcon, ForkIcon, TrashIcon, WarningIcon, DownloadIcon, PencilIcon } from "./icons";
import { Markdown } from "./markdown";
import { ActivityPanel } from "./activity-panel";
import { OutputViewer } from "./output-viewer";
import { SessionEventTimeline } from "./session-event-timeline";
import { CollapsibleSection } from "./collapsible-section";
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

function ExperimentAnnotationRow({
  experiment,
  sessionId,
}: {
  experiment: Experiment;
  sessionId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(experiment.annotation ?? "");
  const [localAnnotation, setLocalAnnotation] = useState(experiment.annotation);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const annotationChanged = experiment.annotation !== localAnnotation && !editing;
  if (annotationChanged) {
    setLocalAnnotation(experiment.annotation);
    setValue(experiment.annotation ?? "");
  }

  const save = useCallback(async () => {
    const trimmed = value.trim();
    const newAnnotation = trimmed.length > 0 ? trimmed : null;
    setLocalAnnotation(newAnnotation);
    setEditing(false);

    try {
      const res = await fetch(
        apiUrl(`/api/sessions/${sessionId}/experiments/${experiment.id}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annotation: newAnnotation }),
        }
      );
      if (!res.ok) {
        setLocalAnnotation(experiment.annotation);
      }
    } catch {
      setLocalAnnotation(experiment.annotation);
    }
  }, [value, sessionId, experiment.id, experiment.annotation]);

  const hasAnnotation = localAnnotation !== null && localAnnotation.length > 0;

  return (
    <div
      className="flex items-center gap-2 border-b py-1.5"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-muted)",
          minWidth: "36px",
          textAlign: "center",
        }}
      >
        #{experiment.run_number}
      </span>
      <span
        className="shrink-0 text-xs font-semibold tabular-nums"
        style={{
          color: experiment.committed ? "var(--color-success)" : "var(--color-text-muted)",
          minWidth: "16px",
        }}
      >
        {experiment.committed ? "✓" : "·"}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setValue(localAnnotation ?? "");
              setEditing(false);
            }
          }}
          maxLength={200}
          className="min-w-0 flex-1 rounded border px-2 py-0.5 text-xs"
          style={{
            backgroundColor: "var(--color-bg)",
            borderColor: "var(--color-accent)",
            color: "var(--color-text-primary)",
          }}
          placeholder="Add annotation (max 200 chars)..."
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-xs"
          style={{ color: hasAnnotation ? "var(--color-text-secondary)" : "var(--color-text-muted)" }}
          title={localAnnotation ?? undefined}
        >
          {localAnnotation ?? "—"}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setValue(localAnnotation ?? "");
          setEditing(!editing);
        }}
        className="shrink-0 rounded p-0.5 transition-colors"
        style={{
          color: hasAnnotation ? "var(--color-accent)" : "var(--color-text-muted)",
        }}
        title={hasAnnotation ? `Annotation: ${localAnnotation}` : "Add annotation"}
        aria-label={`${hasAnnotation ? "Edit" : "Add"} annotation for experiment ${experiment.run_number}`}
      >
        <PencilIcon size={12} />
      </button>
    </div>
  );
}

function ExperimentAnnotations({
  experiments,
  sessionId,
}: {
  experiments: Experiment[];
  sessionId: string;
}) {
  const recent = experiments.slice(-20).reverse();

  return (
    <div className="max-h-[300px] overflow-y-auto">
      {recent.map((exp) => (
        <ExperimentAnnotationRow
          key={exp.id}
          experiment={exp}
          sessionId={sessionId}
        />
      ))}
    </div>
  );
}

interface SessionDetailProps {
  session: Session;
  experiments: Experiment[];
  onFork?: (session: Session) => void;
}

export function SessionDetail({ session, experiments, onFork }: SessionDetailProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const updateSessionStatus = useSessionStore((s) => s.updateSessionStatus);
  const removeSession = useSessionStore((s) => s.removeSession);
  const { activity, error: activityError } = useActivityPoll(
    session.id,
    session.status
  );

  const isOrphan = !session.tmux_session;
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const handleExport = useCallback((format: "json" | "csv" | "code") => {
    setExportOpen(false);
    const url = apiUrl(`/api/sessions/${session.id}/export?format=${format}`);
    window.open(url, "_blank");
  }, [session.id]);

  const handleAction = useCallback(
    async (action: "start" | "pause" | "resume" | "restart" | "kill") => {
      if (action === "kill") {
        const confirmed = window.confirm(
          `Kill session "${session.tag}"? The worktree will be preserved.`
        );
        if (!confirmed) return;
      }
      if (action === "restart") {
        const confirmed = window.confirm(
          `Restart session "${session.tag}"? This will spawn a fresh agent process.`
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
        } else {
          const data = (await res.json().catch(() => ({ error: `Action failed (${res.status})` }))) as { error?: string };
          alert(data.error ?? `Failed to ${action} session`);
        }
      } finally {
        setLoading(null);
      }
    },
    [session.id, session.tag, updateSessionStatus]
  );

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      `Delete session "${session.tag}"? This will remove the session record. The git worktree will NOT be deleted.`
    );
    if (!confirmed) return;

    setLoading("delete");
    try {
      const res = await fetch(apiUrl(`/api/sessions/${session.id}`), {
        method: "DELETE",
      });
      if (res.ok) {
        removeSession(session.id);
      }
    } finally {
      setLoading(null);
    }
  }, [session.id, session.tag, removeSession]);

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
        {session.restart_count > 0 && (
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: "var(--color-warning)" }}
          >
            ↻ {session.restart_count} restart{session.restart_count > 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {session.status === "queued" && (
            <button
              disabled={loading !== null}
              onClick={() => void handleAction("start")}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-status-running-bg)",
                color: "var(--color-status-running-text)",
              }}
            >
              <PlayIcon size={12} />
              {loading === "start" ? "..." : "Start"}
            </button>
          )}
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
          {session.status === "paused" && !isOrphan && (
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
          {(session.status === "running" || session.status === "paused" || session.status === "killed" || session.status === "failed") && (
            <button
              disabled={loading !== null}
              onClick={() => void handleAction("restart")}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-status-running-bg)",
                color: "var(--color-status-running-text)",
              }}
            >
              <PlayIcon size={12} />
              {loading === "restart" ? "..." : "Restart"}
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
          {experiments.length > 0 && (
            <div className="relative" ref={exportRef}>
              <button
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: "var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
                onClick={() => setExportOpen((v) => !v)}
                title="Export session data"
              >
                <DownloadIcon size={12} />
                Export
              </button>
              {exportOpen && (
                <div
                  className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded border py-1 shadow-lg"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5"
                    style={{ color: "var(--color-text-primary)" }}
                    onClick={() => handleExport("json")}
                  >
                    <DownloadIcon size={10} />
                    Full Report (JSON)
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5"
                    style={{ color: "var(--color-text-primary)" }}
                    onClick={() => handleExport("csv")}
                  >
                    <DownloadIcon size={10} />
                    Experiments (CSV)
                  </button>
                  {session.worktree_path && (
                    <button
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5"
                      style={{ color: "var(--color-text-primary)" }}
                      onClick={() => handleExport("code")}
                    >
                      <DownloadIcon size={10} />
                      Code (tar.gz)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {(session.status === "killed" || session.status === "completed" || session.status === "failed" || session.status === "queued") && (
            <button
              disabled={loading !== null}
              onClick={() => void handleDelete()}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
              }}
              title="Delete this session record"
            >
              <TrashIcon size={12} />
              {loading === "delete" ? "..." : "Delete"}
            </button>
          )}
        </div>
      </div>

      {/* Orphan warning banner */}
      {session.status === "running" && isOrphan && (
        <div
          className="flex items-center gap-2 rounded border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--color-warning)",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            color: "var(--color-warning)",
          }}
        >
          <WarningIcon size={14} />
          <span>
            Session appears orphaned — no active process detected. Health agent will auto-restart.
          </span>
        </div>
      )}

      {/* Overview — expanded by default */}
      <CollapsibleSection title="Overview" defaultExpanded>
        {/* Strategy */}
        <div
          className="rounded border p-3 text-xs leading-relaxed"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          <Markdown content={session.strategy} />
        </div>

        {/* Metrics Row */}
        <div className="mt-3 flex flex-wrap gap-3">
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

        {/* Session Event Timeline */}
        <div className="mt-3">
          <SessionEventTimeline sessionId={session.id} />
        </div>
      </CollapsibleSection>

      {/* Activity — expanded when running/paused */}
      {((session.status === "running" || session.status === "paused") ||
        ((session.status === "killed" || session.status === "failed" || session.status === "completed") &&
          (session.last_summary !== null || session.last_output_snapshot !== null))) && (
        <CollapsibleSection
          title="Activity"
          defaultExpanded={session.status === "running" || session.status === "paused"}
        >
          {/* Live Activity */}
          {(session.status === "running" || session.status === "paused") && (
            <ActivityPanel
              activity={activity}
              error={activityError}
              isRunning={session.status === "running"}
              experimentCount={session.experiment_count}
              bestValue={session.best_val_bpb}
              metricName={session.metric_name}
              metricDirection={session.metric_direction}
              startedAt={session.started_at}
              lastRestartAt={session.last_restart_at}
              restartCount={session.restart_count}
              lastSummary={session.last_summary}
              strategy={session.strategy}
            />
          )}

          {/* Output viewer for dead sessions */}
          {(session.status === "killed" || session.status === "failed" || session.status === "completed") &&
            (session.last_summary !== null || session.last_output_snapshot !== null) && (
              <OutputViewer
                summary={session.last_summary}
                rawOutput={session.last_output_snapshot}
              />
            )}
        </CollapsibleSection>
      )}

      {/* Experiments — collapsed by default */}
      <CollapsibleSection title="Experiments">
        <ExperimentTimeline experiments={experiments} metricDirection={session.metric_direction} metricName={session.metric_name} />

        <div className="mt-3 flex gap-4">
          <div className="min-w-0 flex-1">
            <CommitFeed experiments={experiments} />
          </div>
          <div className="w-[260px] shrink-0">
            <CodeHeatmap experiments={experiments} />
          </div>
        </div>

        {experiments.length > 0 && (
          <div className="mt-4">
            <div
              className="mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Annotations
            </div>
            <ExperimentAnnotations experiments={experiments} sessionId={session.id} />
          </div>
        )}
      </CollapsibleSection>

      {/* Advanced — collapsed by default */}
      <CollapsibleSection title="Advanced">
        <div className="space-y-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          <div className="flex gap-2">
            <span style={{ color: "var(--color-text-muted)" }}>Branch:</span>
            <span className="font-mono">{session.branch}</span>
          </div>
          {session.worktree_path && (
            <div className="flex gap-2">
              <span style={{ color: "var(--color-text-muted)" }}>Worktree:</span>
              <span className="font-mono truncate">{session.worktree_path}</span>
            </div>
          )}
          {session.tmux_session && (
            <div className="flex gap-2">
              <span style={{ color: "var(--color-text-muted)" }}>tmux:</span>
              <span className="font-mono">{session.tmux_session}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span style={{ color: "var(--color-text-muted)" }}>GPU:</span>
            <span>{session.gpu_index !== null ? `GPU ${session.gpu_index}` : "None"}</span>
          </div>
          <div className="flex gap-2">
            <span style={{ color: "var(--color-text-muted)" }}>Metric:</span>
            <span>{session.metric_name} ({session.metric_direction})</span>
          </div>
          {session.seed_from && (
            <div className="flex gap-2">
              <span style={{ color: "var(--color-text-muted)" }}>Forked from:</span>
              <span className="font-mono">{session.seed_from}</span>
            </div>
          )}
        </div>

        {/* Cross-pollinate hint */}
        {experiments.length > 0 && (
          <div
            className="mt-3 flex items-center gap-3 rounded border border-dashed p-3"
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
      </CollapsibleSection>
    </div>
  );
}
