"use client";

import { useEffect, useState, useCallback } from "react";
import { useSSE } from "@/hooks/use-sse";
import { useGpuPoll } from "@/hooks/use-gpu-poll";
import { useSessionStore } from "@/stores/session-store";
import { apiUrl } from "@/lib/base-path";
import { SessionList } from "./session-list";
import { SessionDetail } from "./session-detail";
import { ComparisonView } from "./comparison-view";
import { NewSessionModal } from "./new-session-modal";
import { ErrorBoundary } from "./error-boundary";
import { TabNavigation } from "./tab-navigation";
import { AnalyticsView } from "./analytics-view";
import { EventsView } from "./events-view";
import { HexIcon, PlusIcon } from "./icons";
import type { Experiment, Session } from "@/lib/types";
import { formatMetricValue, isBetter, metricLabel } from "@/lib/metric-utils";
import { ChatDrawer } from "./chat-drawer";
import { ToastContainer } from "./toast-container";
import { useChatStore } from "@/stores/chat-store";
import { KpiCard } from "./kpi-card";

function StatusPill({
  count,
  label,
  status,
}: {
  count: number;
  label: string;
  status: "running" | "paused" | "queued";
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
      style={{
        backgroundColor: `var(--color-status-${status}-bg)`,
        color: `var(--color-status-${status}-text)`,
      }}
    >
      {count} {label}
    </span>
  );
}

function StatsBar() {
  const sessions = useSessionStore((s) => s.sessions);

  const running = sessions.filter((s) => s.status === "running").length;
  const paused = sessions.filter((s) => s.status === "paused").length;
  const queued = sessions.filter((s) => s.status === "queued").length;
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
    ? `Global Best ${metricLabel(bestSession.metric_name)}`
    : "Global Best";
  const globalBestValue = bestSession
    ? formatMetricValue(bestSession.best_val_bpb, bestSession.metric_name)
    : "--";

  const commitRateDisplay =
    totalExperiments === 0 ? "No experiments yet" : `${commitRate}%`;

  return (
    <div
      className="flex items-center gap-4 overflow-x-auto border-b px-4 py-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <KpiCard label="Sessions" value="" tooltip="Active session counts by status">
        <div className="flex items-center gap-2">
          <StatusPill count={running} label="Running" status="running" />
          <StatusPill count={paused} label="Paused" status="paused" />
          <StatusPill count={queued} label="Queued" status="queued" />
        </div>
      </KpiCard>

      <KpiCard
        label="Experiments"
        value={String(totalExperiments)}
        tooltip="Total experiments across all sessions"
      />

      <KpiCard
        label={globalBestLabel}
        value={globalBestValue}
        tooltip="Best metric value across all sessions"
      />

      <KpiCard
        label="Commit Rate"
        value={commitRateDisplay}
        unit={totalExperiments > 0 ? " overall" : undefined}
        tooltip="Percentage of experiments that were committed (kept) vs discarded"
      />
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
      const res = await fetch(apiUrl(`/api/sessions/${id}/experiments?limit=2000`));
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

  if (view === "analytics") {
    return (
      <ErrorBoundary fallbackLabel="Analytics">
        <AnalyticsView />
      </ErrorBoundary>
    );
  }

  if (view === "events") {
    return (
      <ErrorBoundary fallbackLabel="Events">
        <EventsView />
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

  const [modalOpen, setModalOpen] = useState(false);
  const [forkSource, setForkSource] = useState<Session | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleDrawer = useChatStore((s) => s.toggleDrawer);
  const drawerOpen = useChatStore((s) => s.drawerOpen);
  const suggestedConfig = useChatStore((s) => s.suggestedConfig);
  const clearSuggestion = useChatStore((s) => s.clearSuggestion);

  // Open modal when assistant suggests a session config
  useEffect(() => {
    if (suggestedConfig) {
      setForkSource(null);
      setModalOpen(true);
    }
  }, [suggestedConfig]);

  const openNewModal = useCallback(() => {
    setForkSource(null);
    clearSuggestion();
    setModalOpen(true);
  }, [clearSuggestion]);

  const openForkModal = useCallback((session: Session) => {
    setForkSource(session);
    clearSuggestion();
    setModalOpen(true);
  }, [clearSuggestion]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setForkSource(null);
    clearSuggestion();
  }, [clearSuggestion]);

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
          <button
            type="button"
            onClick={toggleDrawer}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors"
            style={{
              backgroundColor: drawerOpen ? "var(--color-accent)" : "transparent",
              color: drawerOpen ? "var(--color-bg)" : "var(--color-text-secondary)",
              borderWidth: 1,
              borderColor: drawerOpen ? "var(--color-accent)" : "var(--color-border)",
            }}
          >
            <span className="hidden sm:inline">Assistant</span>
            <span className="sm:hidden">AI</span>
          </button>
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

      {/* Tab Navigation */}
      <TabNavigation />

      {/* Stats Bar */}
      <StatsBar />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (view === "dashboard" || view === "compare") && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — only for dashboard and compare views */}
        {(view === "dashboard" || view === "compare") && (
          <div
            className={`${
              sidebarOpen ? "fixed inset-y-0 left-0 z-50" : "hidden"
            } md:relative md:block`}
          >
            <ErrorBoundary fallbackLabel="Session List">
              <SessionList onSelectMobile={() => setSidebarOpen(false)} />
            </ErrorBoundary>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <MainContent onFork={openForkModal} />
        </main>
        <ChatDrawer />
      </div>

      {/* New Session / Fork Modal */}
      <NewSessionModal
        open={modalOpen}
        onClose={closeModal}
        seedFrom={forkSource}
        suggestedConfig={suggestedConfig}
      />
      <ToastContainer />
    </div>
  );
}
