"use client";

import { useState, useMemo } from "react";
import { useEvents } from "@/hooks/use-events";
import { useSessionStore } from "@/stores/session-store";
import type { SessionEventType } from "@/lib/types";
import { ChevronIcon } from "./icons";

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

const ALL_EVENT_TYPES: SessionEventType[] = [
  "started",
  "orphan_detected",
  "auto_restarted",
  "restart_failed",
  "escalation_triggered",
  "escalation_resolved",
  "killed",
  "completed",
  "paused",
  "resumed",
  "experiment_recorded",
  "snapshot_captured",
];

function formatEventDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function EventsView() {
  const sessions = useSessionStore((s) => s.sessions);
  const [sessionFilter, setSessionFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filters = useMemo(() => {
    const f: { session_id?: string; type?: string } = {};
    if (sessionFilter) f.session_id = sessionFilter;
    if (typeFilter) f.type = typeFilter;
    return f;
  }, [sessionFilter, typeFilter]);

  const { events, loading, total } = useEvents(filters);

  const sessionTagMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) {
      map.set(s.id, s.tag);
    }
    return map;
  }, [sessions]);

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Session
          </label>
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            <option value="">All</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.tag}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Type
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            <option value="">All</option>
            {ALL_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--color-text-muted)" }}
        >
          {total} total event{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Event list */}
      <div
        className="flex-1 overflow-y-auto rounded border"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          maxHeight: "calc(100vh - 280px)",
        }}
      >
        {loading && events.length === 0 && (
          <div
            className="py-8 text-center text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Loading events...
          </div>
        )}

        {!loading && events.length === 0 && (
          <div
            className="py-8 text-center text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            No events found
          </div>
        )}

        {events.length > 0 && (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {events.map((event) => {
              const dotColor = EVENT_TYPE_COLORS[event.type] ?? "var(--color-text-muted)";
              const tag = sessionTagMap.get(event.session_id) ?? event.session_id.slice(0, 8);
              const isExpanded = expandedId === event.id;
              const hasDetails = event.details !== null;

              return (
                <div
                  key={event.id}
                  className="px-3 py-2"
                  style={{
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div
                    className={`flex items-start gap-2 ${hasDetails ? "cursor-pointer" : ""}`}
                    role={hasDetails ? "button" : undefined}
                    tabIndex={hasDetails ? 0 : undefined}
                    onClick={hasDetails ? () => setExpandedId(isExpanded ? null : event.id) : undefined}
                    onKeyDown={hasDetails ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : event.id);
                      }
                    } : undefined}
                  >
                    {/* Timestamp */}
                    <span
                      className="shrink-0 tabular-nums text-xs"
                      style={{ color: "var(--color-text-muted)", minWidth: "9em" }}
                    >
                      {formatEventDateTime(event.created_at)}
                    </span>

                    {/* Session tag badge */}
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs"
                      style={{
                        backgroundColor: "rgba(167, 139, 250, 0.15)",
                        color: "var(--color-purple)",
                      }}
                    >
                      {tag}
                    </span>

                    {/* Event type badge */}
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

                    {/* Expand chevron */}
                    {hasDetails && (
                      <span
                        className="shrink-0 transition-transform"
                        style={{
                          color: "var(--color-text-muted)",
                          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        }}
                      >
                        <ChevronIcon size={12} />
                      </span>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isExpanded && event.details && (
                    <pre
                      className="mt-2 overflow-auto rounded p-2 text-xs"
                      style={{
                        backgroundColor: "var(--color-bg)",
                        color: "var(--color-text-muted)",
                        maxHeight: "200px",
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}
                    >
                      {event.details}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
