"use client";

import { useEffect, useState, useCallback } from "react";
import { useSSE } from "@/hooks/use-sse";
import { useGpuPoll } from "@/hooks/use-gpu-poll";
import { useSessionStore } from "@/stores/session-store";
import { SessionList } from "./session-list";
import { SessionDetail } from "./session-detail";
import { ComparisonView } from "./comparison-view";
import { NewSessionModal } from "./new-session-modal";
import { ErrorBoundary } from "./error-boundary";
import { HexIcon, PlusIcon } from "./icons";
import type { Experiment, Session } from "@/lib/types";
import { formatMetricValue, isBetter, metricLabel } from "@/lib/metric-utils";

function StatsBar() {
  const sessions = useSessionStore((s) => s.sessions);

  const running = sessions.filter((s) => s.status === "running").length;
  const paused = sessions.filter((s) => s.status === "paused").length;
  const queued = sessions.filter((s) => s.status === "queued").length;
  const total = sessions.length;
  const totalExperiments = sessions.reduce(
    (sum, s) => sum + s.experiment_count,
    0
  );
  const totalCommits = sessions.reduce((sum, s) => sum + s.commit_count, 0);

  const bestSession = sessions.reduce<Session | null>((best, s) => {
    if (s.best_val_bpb === null) return best;
    if (best === null || best.best_val_bpb === null) return s;
    return isBetter(s.best_val_bpb, best.best_val_bpb, s.metric_direction) ? s : best;
  }, null);

  const commitRate =
    totalExperiments > 0
      ? Math.round((totalCommits / totalExperiments) * 100)
      : 0;

  const globalBestLabel = bestSession
    ? `GLOBAL BEST ${metricLabel(bestSession.metric_name)}`
    : "GLOBAL BEST";
  const globalBestValue = bestSession
    ? formatMetricValue(bestSession.best_val_bpb, bestSession.metric_name)
    : "--";

  const stats = [
    {
      label: "SESSIONS",
      value: `${running}R ${paused}P ${queued}Q`,
      color: "var(--color-accent)",
    },
    {
      label: "EXPERIMENTS",
      value: String(totalExperiments),
      color: "var(--color-text-primary)",
    },
    {
      label: globalBestLabel,
      value: globalBestValue,
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
      className="flex items-center gap-4 overflow-x-auto border-b px-4 py-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex shrink-0 items-baseline gap-2">
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

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div
        className="h-3 w-48 rounded"
        style={{
          backgroundColor: "var(--color-border)",
          animation: "pulse 2s ease-in-out infinite",
        }}
      />
      <div
        className="h-3 w-32 rounded"
        style={{
          backgroundColor: "var(--color-border)",
          animation: "pulse 2s ease-in-out infinite",
          animationDelay: "0.3s",
        }}
      />
    </div>
  );
}

function MainContent({
  onFork,
}: {
  onFork: (session: Session) => void;
}) {
  const view = useSessionStore((s) => s.view);
  const selectedId = useSessionStore((s) => s.selectedId);
  const sessions = useSessionStore((s) => s.sessions);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

  const fetchExperiments = useCallback(async (id: string) => {
    setLoading(true);
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
      /* preserve existing experiments on fetch error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setExperiments([]);
    if (selectedId) {
      void fetchExperiments(selectedId);
    }
  }, [selectedId, fetchExperiments]);

  const selectedExpCount = selectedSession?.experiment_count ?? 0;
  useEffect(() => {
    if (selectedId && selectedExpCount > 0) {
      void fetchExperiments(selectedId);
    }
  }, [selectedId, selectedExpCount, fetchExperiments]);

  if (view === "compare") {
    return (
      <ErrorBoundary fallbackLabel="Comparison">
        <ComparisonView />
      </ErrorBoundary>
    );
  }

  if (view === "dashboard" && selectedSession) {
    if (loading && experiments.length === 0) {
      return <LoadingSkeleton />;
    }
    return (
      <ErrorBoundary fallbackLabel="Session Detail">
        <SessionDetail
          session={selectedSession}
          experiments={experiments}
          onFork={onFork}
        />
      </ErrorBoundary>
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

function MenuIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function Dashboard() {
  useSSE();
  useGpuPoll();

  const view = useSessionStore((s) => s.view);
  const setView = useSessionStore((s) => s.setView);

  const [modalOpen, setModalOpen] = useState(false);
  const [forkSource, setForkSource] = useState<Session | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openNewModal = useCallback(() => {
    setForkSource(null);
    setModalOpen(true);
  }, []);

  const openForkModal = useCallback((session: Session) => {
    setForkSource(session);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setForkSource(null);
  }, []);

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
          {/* Mobile hamburger */}
          <button
            className="md:hidden"
            style={{ color: "var(--color-text-secondary)" }}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <MenuIcon size={20} />
          </button>

          <HexIcon size={28} className="text-[var(--color-accent)]" />
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-sm font-bold tracking-wider"
              style={{ color: "var(--color-accent)" }}
            >
              AUTORESEARCH
            </span>
            <span
              className="hidden text-sm font-light tracking-wider sm:inline"
              style={{ color: "var(--color-text-secondary)" }}
            >
              MISSION CONTROL
            </span>
          </div>
          <ConnectionDot />
        </div>

        <div className="flex items-center gap-2">
          <div
            className="hidden rounded border sm:flex"
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
            onClick={openNewModal}
          >
            <PlusIcon size={14} />
            <span className="hidden sm:inline">New Session</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <StatsBar />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? "fixed inset-y-0 left-0 z-50" : "hidden"
          } md:relative md:block`}
        >
          <ErrorBoundary fallbackLabel="Session List">
            <SessionList onSelectMobile={() => setSidebarOpen(false)} />
          </ErrorBoundary>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <MainContent onFork={openForkModal} />
        </main>
      </div>

      {/* New Session / Fork Modal */}
      <NewSessionModal
        open={modalOpen}
        onClose={closeModal}
        seedFrom={forkSource}
      />
    </div>
  );
}
