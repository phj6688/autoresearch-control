"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  const selectedId = useSessionStore((s) => s.selectedId);
  const selectSession = useSessionStore((s) => s.selectSession);
  const setView = useSessionStore((s) => s.setView);
  const sorted = sortSessions(sessions);

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Reset focused index when session list changes
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, sorted.length);
  }, [sorted.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sorted.length === 0) return;

      let nextIndex = focusedIndex;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          nextIndex = focusedIndex < sorted.length - 1 ? focusedIndex + 1 : focusedIndex;
          break;
        case "ArrowUp":
          e.preventDefault();
          nextIndex = focusedIndex > 0 ? focusedIndex - 1 : focusedIndex;
          break;
        case "Home":
          e.preventDefault();
          nextIndex = 0;
          break;
        case "End":
          e.preventDefault();
          nextIndex = sorted.length - 1;
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < sorted.length) {
            selectSession(sorted[focusedIndex].id);
            setView("dashboard");
            onSelectMobile?.();
          }
          return;
        default:
          return;
      }

      setFocusedIndex(nextIndex);
      itemRefs.current[nextIndex]?.scrollIntoView({ block: "nearest" });
    },
    [focusedIndex, sorted, selectSession, setView, onSelectMobile]
  );

  const setItemRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      itemRefs.current[index] = el;
    },
    []
  );

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
          id="session-list-label"
          style={{ color: "var(--color-text-muted)" }}
        >
          Sessions ({sessions.length})
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-labelledby="session-list-label"
          aria-activedescendant={
            focusedIndex >= 0 && focusedIndex < sorted.length
              ? `session-option-${sorted[focusedIndex].id}`
              : undefined
          }
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (focusedIndex < 0 && sorted.length > 0) {
              const selectedIdx = sorted.findIndex((s) => s.id === selectedId);
              setFocusedIndex(selectedIdx >= 0 ? selectedIdx : 0);
            }
          }}
          className="space-y-2"
        >
          {sorted.map((session, index) => (
            <div
              key={session.id}
              ref={setItemRef(index)}
              role="option"
              id={`session-option-${session.id}`}
              aria-selected={selectedId === session.id}
              tabIndex={-1}
              onClick={() => {
                setFocusedIndex(index);
              }}
              onKeyDown={handleKeyDown}
              style={{
                outline:
                  focusedIndex === index
                    ? "2px solid var(--color-accent)"
                    : "none",
                outlineOffset: "2px",
                borderRadius: "6px",
              }}
            >
              <SessionCard
                session={session}
                onSelectMobile={onSelectMobile}
              />
            </div>
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
