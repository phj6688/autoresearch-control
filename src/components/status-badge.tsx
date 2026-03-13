"use client";

import type { SessionStatus } from "@/lib/types";

const STATUS_STYLES: Record<
  SessionStatus,
  { bg: string; text: string; dot: string }
> = {
  running: {
    bg: "var(--color-status-running-bg)",
    text: "var(--color-status-running-text)",
    dot: "var(--color-status-running-text)",
  },
  completed: {
    bg: "var(--color-status-completed-bg)",
    text: "var(--color-status-completed-text)",
    dot: "var(--color-status-completed-text)",
  },
  queued: {
    bg: "var(--color-status-queued-bg)",
    text: "var(--color-status-queued-text)",
    dot: "var(--color-status-queued-text)",
  },
  failed: {
    bg: "var(--color-status-failed-bg)",
    text: "var(--color-status-failed-text)",
    dot: "var(--color-status-failed-text)",
  },
  paused: {
    bg: "var(--color-status-paused-bg)",
    text: "var(--color-status-paused-text)",
    dot: "var(--color-status-paused-text)",
  },
  killed: {
    bg: "var(--color-status-killed-bg)",
    text: "var(--color-status-killed-text)",
    dot: "var(--color-status-killed-text)",
  },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: style.dot,
          animation:
            status === "running" ? "pulse 1.5s ease-in-out infinite" : "none",
        }}
      />
      {status}
    </span>
  );
}
