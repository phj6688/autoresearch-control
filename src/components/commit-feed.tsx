"use client";

import { useState } from "react";
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
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
        {committed.map((exp) => {
          const isExpanded = expandedId === exp.id;
          return (
            <div key={exp.id}>
              <div
                role="button"
                tabIndex={0}
                className="flex cursor-pointer items-center gap-3 border-b py-2 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                style={{ borderColor: "var(--color-border)" }}
                onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedId(isExpanded ? null : exp.id);
                  }
                }}
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
                  className={`min-w-0 flex-1 text-xs ${isExpanded ? "" : "truncate"}`}
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
              {isExpanded && (
                <div
                  className="border-b px-2 py-2 text-xs leading-relaxed"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-muted)",
                    backgroundColor: "rgba(255,255,255,0.02)",
                  }}
                >
                  {exp.change_summary ?? "No description"}
                  {exp.git_hash && (
                    <span className="ml-2 font-mono opacity-60">
                      {exp.git_hash.slice(0, 8)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
