"use client";

import type { Session, Experiment } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";
import { StatusBadge } from "./status-badge";
import { Sparkline } from "./sparkline";
import { CompareIcon } from "./icons";

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
            {session.tag}
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
          title={isComparing ? "Remove from comparison" : "Add to comparison"}
        >
          <CompareIcon size={14} />
        </button>
      </div>

      <div
        className="mt-1.5 truncate text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        {session.strategy.slice(0, 60)}
        {session.strategy.length > 60 ? "..." : ""}
      </div>

      <div className="mt-2">
        <Sparkline data={experiments} width={280} height={28} />
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs">
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>BEST </span>
          <span
            className="font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            {session.best_val_bpb?.toFixed(4) ?? "--"}
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
        <div className="ml-auto">
          <span style={{ color: "var(--color-text-muted)" }}>
            {formatElapsed(session.started_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
