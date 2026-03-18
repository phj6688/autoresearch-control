"use client";

import { useState } from "react";
import type { ActivitySnapshot, ActivityType } from "@/lib/types";
import {
  PencilIcon,
  FlaskIcon,
  ChartIcon,
  BrainIcon,
  GitCommitIcon,
  BookIcon,
  WarningIcon,
  ChevronIcon,
} from "./icons";

// --- Icon + color mapping per event type ---

const EVENT_STYLE: Record<ActivityType, { icon: typeof PencilIcon; color: string }> = {
  modifying: { icon: PencilIcon, color: "var(--color-accent)" },
  experimenting: { icon: FlaskIcon, color: "var(--color-purple)" },
  evaluating: { icon: ChartIcon, color: "var(--color-success)" },
  thinking: { icon: BrainIcon, color: "var(--color-text-muted)" },
  committing: { icon: GitCommitIcon, color: "var(--color-warning)" },
  error: { icon: WarningIcon, color: "var(--color-error)" },
  reading: { icon: BookIcon, color: "var(--color-text-secondary)" },
  idle: { icon: BrainIcon, color: "var(--color-text-muted)" },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// --- Layer 1: Activity Bar ---

function ActivityBar({
  activity,
  isRunning,
  expandLevel,
  onToggle,
}: {
  activity: ActivitySnapshot;
  isRunning: boolean;
  expandLevel: number;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-xs transition-colors hover:border-[var(--color-accent)]"
      style={{
        borderColor: expandLevel > 0 ? "var(--color-accent)" : "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{
          backgroundColor: isRunning ? "var(--color-success)" : "var(--color-warning)",
          animation: isRunning ? "pulse 2s ease-in-out infinite" : "none",
        }}
      />

      <span
        className="min-w-0 flex-1 truncate"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {activity.summary}
      </span>

      {activity.modifiedFiles.length > 0 && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums"
          style={{
            backgroundColor: "rgba(34, 211, 238, 0.1)",
            color: "var(--color-accent)",
          }}
        >
          {activity.modifiedFiles.length} file{activity.modifiedFiles.length > 1 ? "s" : ""}
        </span>
      )}

      <span
        className="shrink-0 transition-transform"
        style={{
          color: "var(--color-text-muted)",
          transform: expandLevel > 0 ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >
        <ChevronIcon size={12} />
      </span>
    </button>
  );
}

// --- Layer 2: Event Feed ---

function EventFeed({ activity }: { activity: ActivitySnapshot }) {
  const events = activity.events.slice(-15).reverse();

  return (
    <div
      className="mt-1 rounded border p-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {events.length === 0 ? (
        <div
          className="py-2 text-center text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          No activity detected yet
        </div>
      ) : (
        <div className="space-y-0.5">
          {events.map((event, i) => {
            const style = EVENT_STYLE[event.type];
            const Icon = style.icon;
            return (
              <div key={`${event.ts}-${i}`} className="flex items-start gap-2 py-0.5">
                <span
                  className="shrink-0 tabular-nums text-xs"
                  style={{ color: "var(--color-text-muted)", minWidth: "5.5em" }}
                >
                  {formatTime(event.ts)}
                </span>
                <span className="mt-0.5 shrink-0" style={{ color: style.color }}>
                  <Icon size={12} />
                </span>
                <span
                  className="min-w-0 flex-1 text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {event.message}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {activity.modifiedFiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
          {activity.modifiedFiles.map((f) => (
            <span
              key={f}
              className="rounded px-1.5 py-0.5 text-xs"
              style={{
                backgroundColor: "rgba(34, 211, 238, 0.08)",
                color: "var(--color-accent)",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main exported component ---

interface ActivityPanelProps {
  activity: ActivitySnapshot | null;
  error: string | null;
  isRunning: boolean;
}

export function ActivityPanel({ activity, error, isRunning }: ActivityPanelProps) {
  const [expandLevel, setExpandLevel] = useState(0);

  function toggleExpand() {
    setExpandLevel((prev) => (prev >= 1 ? 0 : 1));
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-2 rounded border px-3 py-2 text-xs"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-muted)",
        }}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-text-muted)" }} />
        {error}
      </div>
    );
  }

  if (!activity) {
    return (
      <div
        className="flex items-center gap-2 rounded border px-3 py-2 text-xs"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-muted)",
        }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: "var(--color-text-muted)", animation: "pulse 2s ease-in-out infinite" }}
        />
        Connecting to agent process...
      </div>
    );
  }

  return (
    <div>
      <ActivityBar
        activity={activity}
        isRunning={isRunning}
        expandLevel={expandLevel}
        onToggle={toggleExpand}
      />
      {expandLevel >= 1 && <EventFeed activity={activity} />}
    </div>
  );
}
