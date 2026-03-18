"use client";

import { useState } from "react";
import { TerminalIcon, ChevronIcon } from "./icons";

interface OutputViewerProps {
  summary: string | null;
  rawOutput: string | null;
}

export function OutputViewer({ summary, rawOutput }: OutputViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!summary && !rawOutput) {
    return null;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-xs transition-colors hover:border-[var(--color-accent)]"
        style={{
          borderColor: expanded ? "var(--color-accent)" : "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <span style={{ color: "var(--color-text-muted)" }}>
          <TerminalIcon size={14} />
        </span>
        <span
          className="min-w-0 flex-1 truncate"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {summary ?? "Raw output available"}
        </span>
        <span
          className="shrink-0 transition-transform"
          style={{
            color: "var(--color-text-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <ChevronIcon size={12} />
        </span>
      </button>

      {expanded && rawOutput && (
        <pre
          className="mt-1 overflow-auto rounded border p-3 text-xs leading-relaxed"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "#0a0e1a",
            color: "var(--color-text-secondary)",
            maxHeight: "300px",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {rawOutput}
        </pre>
      )}
    </div>
  );
}
