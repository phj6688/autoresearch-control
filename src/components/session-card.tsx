"use client";

import { useCallback } from "react";
import type { Session, Experiment } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";
import { apiUrl } from "@/lib/base-path";
import { StatusBadge } from "./status-badge";
import { Sparkline } from "./sparkline";
import { CompareIcon, ClockIcon } from "./icons";
import { formatMetricValue } from "@/lib/metric-utils";
import { getMetricLabel, getMetricLabelShort } from "@/lib/metric-labels";
import { ContextMenu } from "./context-menu";
import type { ContextMenuItem } from "./context-menu";

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) return "--";
  const elapsed = Math.max(0, Date.now() - startedAt);
  const hours = Math.floor(elapsed / 3600000);
  const mins = Math.floor((elapsed % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const AGENT_SHORT: Record<string, string> = {
  "claude-code": "Claude",
  codex: "Codex",
  aider: "Aider",
  "gemini-cli": "Gemini",
};

function stripTagMarkdown(tag: string): string {
  return tag.replace(/^#+\s*/, "").replace(/\*\*/g, "");
}

interface SessionCardProps {
  session: Session;
  experiments?: Experiment[];
  onSelectMobile?: () => void;
}

export function SessionCard({ session, experiments = [], onSelectMobile }: SessionCardProps) {
  const selectedId = useSessionStore((s) => s.selectedId);
  const compareIds = useSessionStore((s) => s.compareIds);
  const selectSession = useSessionStore((s) => s.selectSession);
  const setView = useSessionStore((s) => s.setView);
  const toggleCompare = useSessionStore((s) => s.toggleCompare);
  const updateSessionStatus = useSessionStore((s) => s.updateSessionStatus);
  const removeSession = useSessionStore((s) => s.removeSession);

  const handleSessionAction = useCallback(
    async (action: "pause" | "resume" | "restart" | "kill") => {
      if (action === "kill") {
        const confirmed = window.confirm(`Kill session "${session.tag}"? The worktree will be preserved.`);
        if (!confirmed) return;
      }
      if (action === "restart") {
        const confirmed = window.confirm(`Restart session "${session.tag}"?`);
        if (!confirmed) return;
      }
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
      } catch {
        /* handled silently */
      }
    },
    [session.id, session.tag, updateSessionStatus]
  );

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(`Delete session "${session.tag}"?`);
    if (!confirmed) return;
    try {
      const res = await fetch(apiUrl(`/api/sessions/${session.id}`), {
        method: "DELETE",
      });
      if (res.ok) {
        removeSession(session.id);
      }
    } catch {
      /* handled silently */
    }
  }, [session.id, session.tag, removeSession]);

  const handleExport = useCallback(() => {
    const url = apiUrl(`/api/sessions/${session.id}/export?format=json`);
    window.open(url, "_blank");
  }, [session.id]);

  const s = session.status;
  const isRunning = s === "running";
  const isPaused = s === "paused";
  const isDead = s === "killed" || s === "completed" || s === "failed";

  const contextMenuItems: ContextMenuItem[] = [
    {
      id: "pause",
      label: "Pause",
      disabled: !isRunning,
      onAction: () => void handleSessionAction("pause"),
    },
    {
      id: "resume",
      label: "Resume",
      disabled: !isPaused,
      onAction: () => void handleSessionAction("resume"),
    },
    {
      id: "restart",
      label: "Restart",
      disabled: s === "queued" || s === "completed",
      onAction: () => void handleSessionAction("restart"),
    },
    {
      id: "fork",
      label: "Fork",
      disabled: session.experiment_count === 0,
      onAction: () => {
        selectSession(session.id);
        setView("dashboard");
      },
    },
    {
      id: "export",
      label: "Export",
      disabled: session.experiment_count === 0,
      onAction: handleExport,
    },
    {
      id: "compare",
      label: compareIds.includes(session.id) ? "Remove from Comparison" : "Add to Comparison",
      onAction: () => toggleCompare(session.id),
    },
    {
      id: "kill",
      label: "Kill",
      disabled: !(isRunning || isPaused),
      danger: true,
      onAction: () => void handleSessionAction("kill"),
    },
    {
      id: "delete",
      label: "Delete",
      disabled: !(isDead || s === "queued"),
      danger: true,
      onAction: () => void handleDelete(),
    },
  ];

  const isSelected = selectedId === session.id;
  const isComparing = compareIds.includes(session.id);
  const hitRate =
    session.experiment_count > 0
      ? Math.round((session.commit_count / session.experiment_count) * 100)
      : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative cursor-pointer rounded border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      style={{
        borderColor: isSelected ? "var(--color-accent)" : "var(--color-border)",
        borderLeftWidth: isSelected ? "3px" : "1px",
        backgroundColor: isSelected
          ? "rgba(34, 211, 238, 0.05)"
          : "var(--color-surface)",
      }}
      onClick={() => {
        selectSession(session.id);
        setView("dashboard");
        onSelectMobile?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectSession(session.id);
          setView("dashboard");
          onSelectMobile?.();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-bold"
            style={{
              color: isSelected
                ? "var(--color-accent)"
                : "var(--color-text-primary)",
            }}
          >
            {stripTagMarkdown(session.tag)}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <StatusBadge status={session.status} />
            <span
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {AGENT_SHORT[session.agent_type] ?? session.agent_type}
            </span>
          </div>
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <button
            className="shrink-0 rounded p-1 transition-colors hover:bg-[var(--color-border)]"
            style={{
              color: isComparing
                ? "var(--color-warning)"
                : "var(--color-text-muted)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleCompare(session.id);
            }}
            aria-label={isComparing ? "Remove from comparison" : "Add to comparison"}
            title={isComparing ? "Remove from comparison" : "Add to comparison"}
          >
            <CompareIcon size={14} />
          </button>
          <ContextMenu items={contextMenuItems} ariaLabel={`Actions for ${session.tag}`} />
        </div>
      </div>

      <div
        className="mt-1.5 truncate text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        {session.strategy.slice(0, 60)}
        {session.strategy.length > 60 ? "..." : ""}
      </div>

      <div className="mt-2">
        <Sparkline data={experiments} width={280} height={28} metricDirection={session.metric_direction} />
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs">
        <div title={`Best ${getMetricLabel(session.metric_name)} (${session.metric_name})`}>
          <span style={{ color: "var(--color-text-muted)" }}>BEST {getMetricLabelShort(session.metric_name)} </span>
          <span
            className="font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            {formatMetricValue(session.best_val_bpb, session.metric_name)}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>RUNS </span>
          <span style={{ color: "var(--color-text-primary)" }}>
            {session.experiment_count}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>HIT </span>
          <span style={{ color: "var(--color-success)" }}>{hitRate}%</span>
        </div>
        <div
          className="ml-auto inline-flex items-center gap-1"
          title="Total session runtime"
        >
          <ClockIcon size={12} />
          <span style={{ color: "var(--color-text-muted)" }}>
            {formatElapsed(session.started_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
