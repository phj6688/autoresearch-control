"use client";

import { useState, useEffect } from "react";
import { useSessionStore } from "@/stores/session-store";

function formatRelativeTime(ts: number | null): string {
  if (ts === null) return "never";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function StatusBar() {
  const connected = useSessionStore((s) => s.connected);
  const sessions = useSessionStore((s) => s.sessions);
  const gpus = useSessionStore((s) => s.gpus);
  const lastUpdateAt = useSessionStore((s) => s.lastUpdateAt);

  // Re-render every 5s to keep the relative timestamp fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const activeSessions = sessions.filter(
    (s) => s.status === "running" || s.status === "paused"
  ).length;

  const totalGpuMemory = gpus.reduce((sum, g) => sum + g.memory_total_mb, 0);
  const usedGpuMemory = gpus.reduce((sum, g) => sum + g.memory_used_mb, 0);

  const gpuLabel =
    gpus.length > 0
      ? `${(usedGpuMemory / 1024).toFixed(1)} / ${(totalGpuMemory / 1024).toFixed(1)} GB`
      : "No GPUs";

  return (
    <div
      className="flex items-center gap-4 border-t px-4 text-xs tabular-nums"
      style={{
        height: "30px",
        minHeight: "30px",
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text-muted)",
      }}
    >
      {/* SSE connection */}
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: connected
              ? "var(--color-success)"
              : "var(--color-error)",
          }}
        />
        <span style={{ color: connected ? "var(--color-success)" : "var(--color-error)" }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Separator */}
      <span style={{ color: "var(--color-border)" }}>|</span>

      {/* Last update */}
      <span>Updated {formatRelativeTime(lastUpdateAt)}</span>

      {/* Separator */}
      <span style={{ color: "var(--color-border)" }}>|</span>

      {/* Active sessions */}
      <span>
        {activeSessions} active session{activeSessions !== 1 ? "s" : ""}
      </span>

      {/* Separator */}
      <span style={{ color: "var(--color-border)" }}>|</span>

      {/* GPU memory */}
      <span>GPU {gpuLabel}</span>
    </div>
  );
}
