"use client";

import { useSessionStore } from "@/stores/session-store";

type View = "dashboard" | "compare" | "analytics" | "events";

const tabs: Array<{ key: View; label: string }> = [
  { key: "dashboard", label: "Sessions" },
  { key: "analytics", label: "Analytics" },
  { key: "events", label: "Events" },
  { key: "compare", label: "Compare" },
];

export function TabNavigation() {
  const view = useSessionStore((s) => s.view);
  const setView = useSessionStore((s) => s.setView);

  return (
    <nav
      className="flex border-b"
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
            className="relative px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
            style={{
              color: isActive
                ? "var(--color-accent)"
                : "var(--color-text-muted)",
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
    </nav>
  );
}
