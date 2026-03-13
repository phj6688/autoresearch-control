"use client";

import type { Experiment } from "@/lib/types";

function deltaColor(delta: number | null): string {
  if (delta === null) return "var(--color-text-muted)";
  if (delta < -0.005) return "var(--color-success)";
  if (delta < -0.002) return "var(--color-accent)";
  return "var(--color-text-muted)";
}

interface CommitFeedProps {
  experiments: Experiment[];
}

export function CommitFeed({ experiments }: CommitFeedProps) {
  const committed = experiments
    .filter((e) => e.committed !== 0)
    .slice(-8)
    .reverse();

  if (committed.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center rounded border text-xs"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        No committed experiments yet
      </div>
    );
  }

  return (
    <div>
      <div
        className="mb-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        Recent Commits
      </div>
      <div className="space-y-0">
        {committed.map((exp) => (
          <div
            key={exp.id}
            className="flex items-center gap-3 border-b py-2"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="shrink-0 text-xs font-bold tabular-nums"
              style={{ color: deltaColor(exp.delta), minWidth: "52px" }}
            >
              {exp.delta !== null
                ? `${exp.delta > 0 ? "+" : ""}${exp.delta.toFixed(4)}`
                : "--"}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {exp.change_summary ?? "No description"}
            </span>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums"
              style={{
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-muted)",
              }}
            >
              #{exp.run_number}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
