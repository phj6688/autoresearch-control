"use client";

import { useSessionStore } from "@/stores/session-store";

type View = "dashboard" | "compare" | "analytics" | "events";

const tabs: Array<{ key: View; label: string; panelId: string }> = [
  { key: "dashboard", label: "Sessions", panelId: "tabpanel-dashboard" },
  { key: "analytics", label: "Analytics", panelId: "tabpanel-analytics" },
  { key: "events", label: "Events", panelId: "tabpanel-events" },
  { key: "compare", label: "Compare", panelId: "tabpanel-compare" },
];

export function TabNavigation() {
  const view = useSessionStore((s) => s.view);
  const setView = useSessionStore((s) => s.setView);

  return (
    <nav aria-label="Main navigation">
      <div
        className="flex gap-1 border-b px-2"
        role="tablist"
        aria-label="Views"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        {tabs.map((tab) => {
          const isActive = view === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              aria-controls={tab.panelId}
              id={`tab-${tab.key}`}
              className="relative px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
              style={{
                color: isActive
                  ? "var(--color-accent)"
                  : "var(--color-text-muted)",
                backgroundColor: isActive
                  ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                  : "transparent",
                borderRadius: "4px 4px 0 0",
              }}
              onClick={() => setView(tab.key)}
            >
              {tab.label}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: "var(--color-accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
