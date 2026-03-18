"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/base-path";
import type { SessionEvent, SessionEventType } from "@/lib/types";

const EVENT_TYPE_COLORS: Record<SessionEventType, string> = {
  orphan_detected: "var(--color-error)",
  restart_failed: "var(--color-error)",
  escalation_triggered: "var(--color-error)",
  auto_restarted: "var(--color-warning)",
  escalation_resolved: "var(--color-warning)",
  paused: "var(--color-warning)",
  started: "var(--color-success)",
  resumed: "var(--color-success)",
  experiment_recorded: "var(--color-success)",
  completed: "var(--color-success)",
  killed: "var(--color-text-muted)",
  snapshot_captured: "var(--color-text-muted)",
};

function formatEventTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEventDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  });
}

interface SessionEventTimelineProps {
  sessionId: string;
}

export function SessionEventTimeline({ sessionId }: SessionEventTimelineProps) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/events?limit=50`));
      if (res.ok) {
        const data = (await res.json()) as { events: SessionEvent[] };
        setEvents(data.events);
      }
    } catch {
      /* network error — will show empty state */
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return (
    <div>
      <div
        className="mb-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        Session Events
      </div>

      <div
        className="overflow-y-auto rounded border"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          maxHeight: "200px",
        }}
      >
        {loading && events.length === 0 && (
          <div
            className="py-4 text-center text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Loading events...
          </div>
        )}

        {!loading && events.length === 0 && (
          <div
            className="py-4 text-center text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            No events recorded yet
          </div>
        )}

        {events.length > 0 && (
          <div className="space-y-0 p-2">
            {events.map((event) => {
              const dotColor = EVENT_TYPE_COLORS[event.type] ?? "var(--color-text-muted)";
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-2 py-1"
                >
                  {/* Colored dot */}
                  <span
                    className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />

                  {/* Timestamp */}
                  <span
                    className="shrink-0 tabular-nums text-xs"
                    style={{ color: "var(--color-text-muted)", minWidth: "6.5em" }}
                  >
                    {formatEventDate(event.created_at)}{" "}
                    {formatEventTime(event.created_at)}
                  </span>

                  {/* Type badge */}
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${dotColor} 15%, transparent)`,
                      color: dotColor,
                    }}
                  >
                    {event.type.replace(/_/g, " ")}
                  </span>

                  {/* Message */}
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
      </div>
    </div>
  );
}
