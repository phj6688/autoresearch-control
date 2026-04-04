"use client";

import type { SessionStatus } from "@/lib/types";
import type { ComponentType } from "react";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  QueuedIcon,
  CompletedIcon,
  FailedIcon,
} from "./icons";

const STATUS_STYLES: Record<
  SessionStatus,
  { bg: string; text: string }
> = {
  running: {
    bg: "var(--color-status-running-bg)",
    text: "var(--color-status-running-text)",
  },
  completed: {
    bg: "var(--color-status-completed-bg)",
    text: "var(--color-status-completed-text)",
  },
  queued: {
    bg: "var(--color-status-queued-bg)",
    text: "var(--color-status-queued-text)",
  },
  failed: {
    bg: "var(--color-status-failed-bg)",
    text: "var(--color-status-failed-text)",
  },
  paused: {
    bg: "var(--color-status-paused-bg)",
    text: "var(--color-status-paused-text)",
  },
  killed: {
    bg: "var(--color-status-killed-bg)",
    text: "var(--color-status-killed-text)",
  },
};

const STATUS_ICONS: Record<
  SessionStatus,
  ComponentType<{ size?: number; className?: string }>
> = {
  running: PlayIcon,
  paused: PauseIcon,
  queued: QueuedIcon,
  completed: CompletedIcon,
  failed: FailedIcon,
  killed: StopIcon,
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const style = STATUS_STYLES[status];
  const Icon = STATUS_ICONS[status];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      <Icon size={10} />
      {status}
    </span>
  );
}
