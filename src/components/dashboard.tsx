"use client";

import { useEffect, useState, useCallback } from "react";
import { useSSE } from "@/hooks/use-sse";
import { useGpuPoll } from "@/hooks/use-gpu-poll";
import { useSessionStore } from "@/stores/session-store";
import { SessionList } from "./session-list";
import { SessionDetail } from "./session-detail";
import { ComparisonView } from "./comparison-view";
import { HexIcon, PlusIcon } from "./icons";
import type { Experiment, Session } from "@/lib/types";

function StatsBar() {
  const sessions = useSessionStore((s) => s.sessions);

  const running = sessions.filter((s) => s.status === "running").length;
  const total = sessions.length;
  const totalExperiments = sessions.reduce(
    (sum, s) => sum + s.experiment_count,
    0
  );
  const totalCommits = sessions.reduce((sum, s) => sum + s.commit_count, 0);

  const bestBpb = sessions.reduce<number | null>((best, s) => {
    if (s.best_val_bpb === null) return best;
    if (best === null) return s.best_val_bpb;
    return s.best_val_bpb < best ? s.best_val_bpb : best;
  }, null);

  const commitRate =
    totalExperiments > 0
      ? Math.round((totalCommits / totalExperiments) * 100)
      : 0;

  const stats = [
    {
      label: "SESSIONS",
      value: `${running}/${total}`,
      color: "var(--color-accent)",
    },
    {
      label: "EXPERIMENTS",
      value: String(totalExperiments),
      color: "var(--color-text-primary)",
    },
    {
      label: "GLOBAL BEST",
      value: bestBpb?.toFixed(4) ?? "--",
      color: "var(--color-accent)",
    },
    {
      label: "COMMIT RATE",
      value: `${commitRate}%`,
      color: "var(--color-success)",
    },
  ];

  return (
    <div
      className="flex items-center gap-4 border-b px-4 py-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            {stat.label}
          </span>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: stat.color }}
          >
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ConnectionDot() {
  const connected = useSessionStore((s) => s.connected);
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{
        backgroundColor: connected
          ? "var(--color-success)"
          : "var(--color-error)",
      }}
      title={connected ? "Connected" : "Disconnected"}
    />
  );
}

function MainContent() {
  const view = useSessionStore((s) => s.view);
  const selectedId = useSessionStore((s) => s.selectedId);
  const sessions = useSessionStore((s) => s.sessions);
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

  const fetchExperiments = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}/experiments?limit=2000`);
      if (res.ok) {
        const data = (await res.json()) as {
          experiments: Experiment[];
          total: number;
        };
        setExperiments(data.experiments);
      }
    } catch {
      setExperiments([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      void fetchExperiments(selectedId);
    } else {
      setExperiments([]);
    }
  }, [selectedId, fetchExperiments]);

  // Refetch when experiment count changes (SSE updates)
  const selectedExpCount = selectedSession?.experiment_count ?? 0;
  useEffect(() => {
    if (selectedId && selectedExpCount > 0) {
      void fetchExperiments(selectedId);
    }
  }, [selectedId, selectedExpCount, fetchExperiments]);

  if (view === "compare") {
    return <ComparisonView />;
  }

  if (view === "dashboard" && selectedSession) {
    return (
      <SessionDetail session={selectedSession} experiments={experiments} />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <HexIcon size={48} className="text-[var(--color-border)]" />
      <div
        className="text-lg font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        Select a Session
      </div>
      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Choose a session from the sidebar to view details
      </div>
    </div>
  );
}

export function Dashboard() {
  useSSE();
  useGpuPoll();

  const view = useSessionStore((s) => s.view);
  const setView = useSessionStore((s) => s.setView);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center justify-between border-b px-4 py-2"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="flex items-center gap-3">
          <HexIcon size={28} className="text-[var(--color-accent)]" />
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-sm font-bold tracking-wider"
              style={{ color: "var(--color-accent)" }}
            >
              AUTORESEARCH
            </span>
            <span
              className="text-sm font-light tracking-wider"
              style={{ color: "var(--color-text-secondary)" }}
            >
              MISSION CONTROL
            </span>
          </div>
          <ConnectionDot />
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex rounded border"
            style={{ borderColor: "var(--color-border)" }}
          >
            <button
              className="px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors"
              style={{
                backgroundColor:
                  view === "dashboard" ? "var(--color-accent)" : "transparent",
                color:
                  view === "dashboard"
                    ? "var(--color-bg)"
                    : "var(--color-text-secondary)",
              }}
              onClick={() => setView("dashboard")}
            >
              Dashboard
            </button>
            <button
              className="px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors"
              style={{
                backgroundColor:
                  view === "compare" ? "var(--color-accent)" : "transparent",
                color:
                  view === "compare"
                    ? "var(--color-bg)"
                    : "var(--color-text-secondary)",
              }}
              onClick={() => setView("compare")}
            >
              Compare
            </button>
          </div>

          <button
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            <PlusIcon size={14} />
            New Session
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <StatsBar />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        <SessionList />
        <main className="flex-1 overflow-y-auto p-6">
          <MainContent />
        </main>
      </div>
    </div>
  );
}
