"use client";

import { useSessionStore } from "@/stores/session-store";
import { GpuBar } from "./gpu-bar";
import { SessionCard } from "./session-card";
import type { Session } from "@/lib/types";

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  paused: 1,
  queued: 2,
  completed: 3,
  failed: 4,
  killed: 5,
};

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const orderA = STATUS_ORDER[a.status] ?? 99;
    const orderB = STATUS_ORDER[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return b.created_at - a.created_at;
  });
}

interface SessionListProps {
  onSelectMobile?: () => void;
}

export function SessionList({ onSelectMobile }: SessionListProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const sorted = sortSessions(sessions);

  return (
    <aside
      className="flex h-full w-[340px] shrink-0 flex-col overflow-hidden border-r"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div className="overflow-y-auto p-3">
        <GpuBar />

        <div
          className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Sessions ({sessions.length})
        </div>

        <div className="space-y-2">
          {sorted.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onSelectMobile={onSelectMobile}
            />
          ))}
        </div>

        {sessions.length === 0 && (
          <div
            className="mt-4 text-center text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            No sessions yet
          </div>
        )}
      </div>
    </aside>
  );
}
