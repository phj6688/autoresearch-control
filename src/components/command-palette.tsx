"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSessionStore } from "@/stores/session-store";
import { StatusBadge } from "./status-badge";
import { SearchIcon } from "./icons";

interface CommandItem {
  id: string;
  label: string;
  category: "Sessions" | "Views" | "Actions";
  onSelect: () => void;
  status?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNewSession: () => void;
}

export function CommandPalette({ open, onClose, onNewSession }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sessions = useSessionStore((s) => s.sessions);
  const selectSession = useSessionStore((s) => s.selectSession);
  const setView = useSessionStore((s) => s.setView);

  const allItems = useMemo((): CommandItem[] => {
    const items: CommandItem[] = [];

    // Sessions
    for (const session of sessions) {
      items.push({
        id: `session-${session.id}`,
        label: session.tag,
        category: "Sessions",
        status: session.status,
        onSelect: () => {
          selectSession(session.id);
          setView("dashboard");
        },
      });
    }

    // Views
    const views: Array<{ key: "dashboard" | "analytics" | "events" | "compare"; label: string }> = [
      { key: "analytics", label: "Analytics" },
      { key: "events", label: "Events" },
      { key: "compare", label: "Compare" },
      { key: "dashboard", label: "Sessions Dashboard" },
    ];
    for (const v of views) {
      items.push({
        id: `view-${v.key}`,
        label: v.label,
        category: "Views",
        onSelect: () => {
          setView(v.key);
          selectSession(null);
        },
      });
    }

    // Actions
    items.push({
      id: "action-new-session",
      label: "New Session",
      category: "Actions",
      onSelect: onNewSession,
    });

    const runningSessions = sessions.filter((s) => s.status === "running");
    if (runningSessions.length > 0) {
      items.push({
        id: "action-pause-all",
        label: `Pause All Running (${runningSessions.length})`,
        category: "Actions",
        onSelect: () => {
          /* This would need batch action support — placeholder */
        },
      });
    }

    const pausedSessions = sessions.filter((s) => s.status === "paused");
    if (pausedSessions.length > 0) {
      items.push({
        id: "action-resume-all",
        label: `Resume All Paused (${pausedSessions.length})`,
        category: "Actions",
        onSelect: () => {
          /* placeholder */
        },
      });
    }

    return items;
  }, [sessions, selectSession, setView, onNewSession]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const lower = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower)
    );
  }, [allItems, query]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input on next frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp selected index when filtered items change
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      item.onSelect();
      onClose();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            handleSelect(filteredItems[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [filteredItems, selectedIndex, handleSelect, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected=\"true\"]");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  // Group items by category for display
  const categories = ["Sessions", "Views", "Actions"] as const;
  const grouped = new Map<string, CommandItem[]>();
  for (const item of filteredItems) {
    const existing = grouped.get(item.category) ?? [];
    existing.push(item);
    grouped.set(item.category, existing);
  }

  // Build flat index mapping for selection
  let flatIndex = 0;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-label="Command palette"
      aria-modal
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border shadow-2xl"
        style={{
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: "var(--color-border)" }}
        >
          <SearchIcon size={16} className="text-[var(--color-text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search sessions, views, actions..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-text-primary)" }}
            aria-label="Command palette search"
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={
              filteredItems[selectedIndex]
                ? `cmd-${filteredItems[selectedIndex].id}`
                : undefined
            }
          />
          <kbd
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: "var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {filteredItems.length === 0 && (
            <div
              className="px-3 py-6 text-center text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {categories.map((category) => {
            const items = grouped.get(category);
            if (!items || items.length === 0) return null;

            return (
              <div key={category}>
                <div
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {category}
                </div>
                {items.map((item) => {
                  const thisIndex = flatIndex++;
                  const isSelected = thisIndex === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      id={`cmd-${item.id}`}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      data-selected={isSelected}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs transition-colors"
                      style={{
                        backgroundColor: isSelected
                          ? "rgba(255, 255, 255, 0.07)"
                          : "transparent",
                        color: "var(--color-text-primary)",
                      }}
                      onClick={() => handleSelect(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelect(item);
                        }
                      }}
                      onMouseEnter={() => setSelectedIndex(thisIndex)}
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.status && (
                        <StatusBadge status={item.status as "running" | "paused" | "queued" | "killed" | "completed" | "failed"} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center gap-3 border-t px-3 py-1.5 text-[10px]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          <span>
            <kbd className="rounded px-1 py-0.5 font-semibold" style={{ backgroundColor: "var(--color-border)" }}>↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded px-1 py-0.5 font-semibold" style={{ backgroundColor: "var(--color-border)" }}>↵</kbd> select
          </span>
          <span>
            <kbd className="rounded px-1 py-0.5 font-semibold" style={{ backgroundColor: "var(--color-border)" }}>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
