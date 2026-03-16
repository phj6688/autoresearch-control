# Activity Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-layer progressive-disclosure activity panel to the session detail view that shows live agent output, parsed structured events, and raw terminal output.

**Architecture:** New `activity-parser.ts` captures tmux pane output and enriches with git status. New API route `/api/sessions/[id]/activity` exposes snapshots. New `activity-panel.tsx` component polls every 3s when session is running, renders 3 collapsible layers.

**Tech Stack:** Next.js App Router API routes, tmux CLI, simple-git, Zustand (existing), Tailwind CSS variables (existing pattern)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/activity-parser.ts` | Capture tmux pane, parse events, enrich with git status |
| Create | `src/app/api/sessions/[id]/activity/route.ts` | API endpoint returning ActivitySnapshot |
| Create | `src/components/activity-panel.tsx` | 3-layer UI component with polling |
| Create | `src/hooks/use-activity-poll.ts` | Polling hook for activity data |
| Modify | `src/lib/types.ts` | Add ActivityEvent, ActivitySnapshot types |
| Modify | `src/components/icons.tsx` | Add activity-type icons (pencil, flask, chart, brain, git, terminal) |
| Modify | `src/components/session-detail.tsx` | Insert ActivityPanel after strategy box |

---

## Chunk 1: Backend — Types + Activity Parser + API Route

### Task 1: Add types to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts` (append after line 164)

- [ ] **Step 1: Add ActivityEvent and ActivitySnapshot types**

Append to `src/lib/types.ts`:

```typescript
export type ActivityType =
  | "modifying"
  | "experimenting"
  | "evaluating"
  | "thinking"
  | "committing"
  | "error"
  | "reading"
  | "idle";

export interface ActivityEvent {
  ts: number;
  type: ActivityType;
  message: string;
}

export type ActivityStatus =
  | "experimenting"
  | "modifying"
  | "evaluating"
  | "thinking"
  | "idle"
  | "error";

export interface ActivitySnapshot {
  status: ActivityStatus;
  summary: string;
  events: ActivityEvent[];
  rawOutput: string;
  modifiedFiles: string[];
  lastActivityAt: number;
}
```

- [ ] **Step 2: Run typecheck**

Run: `docker exec autoresearch-control sh -c "cd /app && npx tsc --noEmit"` or locally `npx tsc --noEmit`
Expected: PASS (types are only definitions, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(activity): add ActivityEvent and ActivitySnapshot types"
```

---

### Task 2: Create `src/lib/activity-parser.ts`

**Files:**
- Create: `src/lib/activity-parser.ts`

- [ ] **Step 1: Create the activity parser module**

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import simpleGit from "simple-git";
import type { ActivityEvent, ActivitySnapshot, ActivityStatus, ActivityType } from "./types";

const execFileAsync = promisify(execFile);

// --- Tmux capture ---

async function captureTmuxPane(tmuxSession: string, lines = 50): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane", "-p", "-t", tmuxSession, "-S", `-${lines}`,
    ], { timeout: 5000 });
    return stdout;
  } catch {
    return "";
  }
}

// --- Git status ---

async function getModifiedFiles(worktreePath: string): Promise<string[]> {
  try {
    const git = simpleGit({ baseDir: worktreePath, maxConcurrentProcesses: 1 });
    const status = await git.status();
    const files = [
      ...status.modified,
      ...status.not_added,
      ...status.created,
      ...status.staged,
    ];
    return [...new Set(files)];
  } catch {
    return [];
  }
}

// --- Event parsing ---

interface PatternRule {
  pattern: RegExp;
  type: ActivityType;
  extract: (match: RegExpMatchArray, line: string) => string;
}

const PATTERNS: PatternRule[] = [
  {
    pattern: /(?:reading|opening|loading)\s+[`"']?([^\s`"']+)/i,
    type: "reading",
    extract: (m) => `Reading ${m[1]}`,
  },
  {
    pattern: /(?:modifying|editing|updating|writing|changing)\s+[`"']?([^\s`"']+)/i,
    type: "modifying",
    extract: (m) => `Modifying ${m[1]}`,
  },
  {
    pattern: /(?:running experiment|experiment\s*#?\s*(\d+)|starting experiment)/i,
    type: "experimenting",
    extract: (m) => m[1] ? `Running experiment #${m[1]}` : "Starting experiment",
  },
  {
    pattern: /(?:evaluating|eval[:\s]|computing.*(?:metric|score|f1|bpb)|val_bpb)/i,
    type: "evaluating",
    extract: () => "Evaluating results",
  },
  {
    pattern: /(?:training|step\s+(\d+)|epoch\s+(\d+)|loss[:\s]\s*([\d.]+))/i,
    type: "experimenting",
    extract: (m) => {
      if (m[1]) return `Training step ${m[1]}`;
      if (m[2]) return `Training epoch ${m[2]}`;
      if (m[3]) return `Training — loss: ${m[3]}`;
      return "Training";
    },
  },
  {
    pattern: /(?:committing|committed|git commit|git add)/i,
    type: "committing",
    extract: () => "Committing changes",
  },
  {
    pattern: /(?:error|exception|traceback|fatal|failed)/i,
    type: "error",
    extract: (_m, line) => line.trim().slice(0, 80),
  },
  {
    pattern: /(?:thinking|planning|analyzing|considering)/i,
    type: "thinking",
    extract: () => "Thinking...",
  },
];

function parseEvents(rawOutput: string): ActivityEvent[] {
  const lines = rawOutput.split("\n").filter((l) => l.trim());
  const events: ActivityEvent[] = [];
  const now = Date.now();

  // Walk lines from oldest to newest, assign approximate timestamps
  const lineCount = lines.length;
  for (let i = 0; i < lineCount; i++) {
    const line = lines[i];
    for (const rule of PATTERNS) {
      const match = line.match(rule.pattern);
      if (match) {
        events.push({
          ts: now - (lineCount - i) * 1000, // approximate: 1s per line
          type: rule.type,
          message: rule.extract(match, line),
        });
        break; // first matching pattern wins
      }
    }
  }

  return events;
}

function deriveStatus(events: ActivityEvent[]): ActivityStatus {
  if (events.length === 0) return "idle";
  const last = events[events.length - 1];
  switch (last.type) {
    case "experimenting": return "experimenting";
    case "modifying": return "modifying";
    case "evaluating": return "evaluating";
    case "thinking": return "thinking";
    case "reading": return "thinking";
    case "committing": return "modifying";
    case "error": return "error";
    case "idle": return "idle";
    default: return "idle";
  }
}

function buildSummary(
  status: ActivityStatus,
  events: ActivityEvent[],
  modifiedFiles: string[]
): string {
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  if (!lastEvent) return "Waiting for activity...";

  const elapsed = Date.now() - lastEvent.ts;
  const ago = elapsed < 60000
    ? `${Math.round(elapsed / 1000)}s ago`
    : `${Math.round(elapsed / 60000)}m ago`;

  const parts: string[] = [lastEvent.message];

  // Add file context if modifying
  if (status === "modifying" && modifiedFiles.length > 0) {
    const fileList = modifiedFiles.slice(0, 3).join(", ");
    const extra = modifiedFiles.length > 3 ? ` +${modifiedFiles.length - 3}` : "";
    parts[0] = `Modifying ${fileList}${extra}`;
  }

  parts.push(ago);
  return parts.join(" — ");
}

// --- Main export ---

export async function captureActivity(
  tmuxSession: string,
  worktreePath: string | null
): Promise<ActivitySnapshot> {
  const [rawOutput, modifiedFiles] = await Promise.all([
    captureTmuxPane(tmuxSession),
    worktreePath ? getModifiedFiles(worktreePath) : Promise.resolve([]),
  ]);

  const events = parseEvents(rawOutput);
  const status = deriveStatus(events);
  const summary = buildSummary(status, events, modifiedFiles);
  const lastActivityAt = events.length > 0
    ? events[events.length - 1].ts
    : 0;

  return {
    status,
    summary,
    events: events.slice(-20), // last 20 events
    rawOutput,
    modifiedFiles,
    lastActivityAt,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/activity-parser.ts
git commit -m "feat(activity): add tmux capture + event parser with git enrichment"
```

---

### Task 3: Create API route `src/app/api/sessions/[id]/activity/route.ts`

**Files:**
- Create: `src/app/api/sessions/[id]/activity/route.ts`

- [ ] **Step 1: Create the activity API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { captureActivity } from "@/lib/activity-parser";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const session = db.getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!session.tmux_session) {
    return NextResponse.json(
      { error: "No live process attached" },
      { status: 404 }
    );
  }

  try {
    const snapshot = await captureActivity(
      session.tmux_session,
      session.worktree_path
    );
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to capture activity";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test with curl**

Run: `curl -s http://localhost:3200/proxy/autoresearch/api/sessions/docboost-main/activity | python3 -m json.tool`
Expected: Either a JSON ActivitySnapshot (if tmux session exists) or `{"error": "No live process attached"}` (404)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sessions/\[id\]/activity/route.ts
git commit -m "feat(activity): add GET /api/sessions/[id]/activity endpoint"
```

---

## Chunk 2: Frontend — Icons + Hook + Activity Panel + Integration

### Task 4: Add activity icons to `src/components/icons.tsx`

**Files:**
- Modify: `src/components/icons.tsx` (append before final closing)

- [ ] **Step 1: Add 6 new icon components**

Append to `src/components/icons.tsx`:

```typescript
export function PencilIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" />
    </svg>
  );
}

export function FlaskIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M6 2V6L2 14H14L10 6V2M5 2H11" />
    </svg>
  );
}

export function ChartIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M2 14L5 8L8 10L11 4L14 6" />
    </svg>
  );
}

export function BrainIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M8 14V8M5 4C5 2.5 6.5 1 8 1S11 2.5 11 4C12.5 4 14 5.5 14 7S12.5 10 11 10H5C3.5 10 2 8.5 2 7S3.5 4 5 4Z" />
    </svg>
  );
}

export function GitCommitIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1V5M8 11V15" />
    </svg>
  );
}

export function TerminalIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="1" y="2" width="14" height="12" rx="1.5" />
      <path d="M4 6L7 8L4 10M9 10H12" />
    </svg>
  );
}

export function BookIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M2 2H6C7 2 8 3 8 4V14C8 13 7 12 6 12H2V2ZM14 2H10C9 2 8 3 8 4V14C8 13 9 12 10 12H14V2Z" />
    </svg>
  );
}

export function WarningIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M8 1L15 14H1L8 1Z" />
      <path d="M8 6V9M8 11V12" />
    </svg>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/icons.tsx
git commit -m "feat(activity): add pencil, flask, chart, brain, git, terminal, book, warning icons"
```

---

### Task 5: Create `src/hooks/use-activity-poll.ts`

**Files:**
- Create: `src/hooks/use-activity-poll.ts`

- [ ] **Step 1: Create the polling hook**

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiUrl } from "@/lib/base-path";
import type { ActivitySnapshot, SessionStatus } from "@/lib/types";

const POLL_INTERVAL = 3000;

export function useActivityPoll(
  sessionId: string | null,
  sessionStatus: SessionStatus | null
): { activity: ActivitySnapshot | null; error: string | null } {
  const [activity, setActivity] = useState<ActivitySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/activity`));
      if (res.ok) {
        const data = (await res.json()) as ActivitySnapshot;
        setActivity(data);
        setError(null);
      } else if (res.status === 404) {
        setError("No live process attached");
        setActivity(null);
      } else {
        setError("Failed to fetch activity");
      }
    } catch {
      setError("Network error");
    }
  }, [sessionId]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!sessionId || (sessionStatus !== "running" && sessionStatus !== "paused")) {
      setActivity(null);
      setError(null);
      return;
    }

    // Fetch immediately
    void fetchActivity();

    // Only poll when running
    if (sessionStatus === "running") {
      intervalRef.current = setInterval(() => {
        void fetchActivity();
      }, POLL_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, sessionStatus, fetchActivity]);

  return { activity, error };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-activity-poll.ts
git commit -m "feat(activity): add useActivityPoll hook with 3s interval"
```

---

### Task 6: Create `src/components/activity-panel.tsx`

**Files:**
- Create: `src/components/activity-panel.tsx`

- [ ] **Step 1: Create the 3-layer activity panel component**

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import type { ActivitySnapshot, ActivityType } from "@/lib/types";
import {
  PencilIcon,
  FlaskIcon,
  ChartIcon,
  BrainIcon,
  GitCommitIcon,
  TerminalIcon,
  BookIcon,
  WarningIcon,
  ChevronIcon,
} from "./icons";

// --- Icon + color mapping per event type ---

const EVENT_STYLE: Record<ActivityType, { icon: typeof PencilIcon; color: string }> = {
  modifying: { icon: PencilIcon, color: "var(--color-accent)" },
  experimenting: { icon: FlaskIcon, color: "var(--color-purple)" },
  evaluating: { icon: ChartIcon, color: "var(--color-success)" },
  thinking: { icon: BrainIcon, color: "var(--color-text-muted)" },
  committing: { icon: GitCommitIcon, color: "var(--color-warning)" },
  error: { icon: WarningIcon, color: "var(--color-error)" },
  reading: { icon: BookIcon, color: "var(--color-text-secondary)" },
  idle: { icon: BrainIcon, color: "var(--color-text-muted)" },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// --- Layer 1: Activity Bar ---

function ActivityBar({
  activity,
  isRunning,
  expandLevel,
  onToggle,
}: {
  activity: ActivitySnapshot;
  isRunning: boolean;
  expandLevel: number;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-xs transition-colors hover:border-[var(--color-accent)]"
      style={{
        borderColor: expandLevel > 0 ? "var(--color-accent)" : "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {/* Pulsing dot */}
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{
          backgroundColor: isRunning ? "var(--color-success)" : "var(--color-warning)",
          animation: isRunning ? "pulse 2s ease-in-out infinite" : "none",
        }}
      />

      {/* Summary */}
      <span
        className="min-w-0 flex-1 truncate"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {activity.summary}
      </span>

      {/* Modified files count */}
      {activity.modifiedFiles.length > 0 && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums"
          style={{
            backgroundColor: "rgba(34, 211, 238, 0.1)",
            color: "var(--color-accent)",
          }}
        >
          {activity.modifiedFiles.length} file{activity.modifiedFiles.length > 1 ? "s" : ""}
        </span>
      )}

      {/* Chevron */}
      <span
        className="shrink-0 transition-transform"
        style={{
          color: "var(--color-text-muted)",
          transform: expandLevel > 0 ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >
        <ChevronIcon size={12} />
      </span>
    </button>
  );
}

// --- Layer 2: Event Feed ---

function EventFeed({ activity }: { activity: ActivitySnapshot }) {
  const events = activity.events.slice(-15).reverse();

  return (
    <div
      className="mt-1 rounded border p-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {events.length === 0 ? (
        <div
          className="py-2 text-center text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          No activity detected yet
        </div>
      ) : (
        <div className="space-y-0.5">
          {events.map((event, i) => {
            const style = EVENT_STYLE[event.type];
            const Icon = style.icon;
            return (
              <div key={`${event.ts}-${i}`} className="flex items-start gap-2 py-0.5">
                <span
                  className="shrink-0 tabular-nums text-xs"
                  style={{ color: "var(--color-text-muted)", minWidth: "5.5em" }}
                >
                  {formatTime(event.ts)}
                </span>
                <span className="shrink-0 mt-0.5" style={{ color: style.color }}>
                  <Icon size={12} />
                </span>
                <span
                  className="min-w-0 flex-1 text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {event.message}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Modified files tags */}
      {activity.modifiedFiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
          {activity.modifiedFiles.map((f) => (
            <span
              key={f}
              className="rounded px-1.5 py-0.5 text-xs"
              style={{
                backgroundColor: "rgba(34, 211, 238, 0.08)",
                color: "var(--color-accent)",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Layer 3: Raw Terminal ---

function RawTerminal({ rawOutput }: { rawOutput: string }) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [rawOutput]);

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5 px-1 py-1">
        <TerminalIcon size={12} />
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Terminal Output
        </span>
      </div>
      <pre
        ref={preRef}
        className="overflow-auto rounded border p-3 text-xs leading-relaxed"
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
        {rawOutput || "No output captured"}
      </pre>
    </div>
  );
}

// --- Main exported component ---

interface ActivityPanelProps {
  activity: ActivitySnapshot | null;
  error: string | null;
  isRunning: boolean;
}

export function ActivityPanel({ activity, error, isRunning }: ActivityPanelProps) {
  const [expandLevel, setExpandLevel] = useState(0); // 0=bar, 1=events, 2=terminal

  function toggleExpand() {
    setExpandLevel((prev) => (prev >= 2 ? 0 : prev + 1));
  }

  // No tmux session
  if (error) {
    return (
      <div
        className="flex items-center gap-2 rounded border px-3 py-2 text-xs"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-muted)",
        }}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-text-muted)" }} />
        {error}
      </div>
    );
  }

  // Loading state
  if (!activity) {
    return (
      <div
        className="flex items-center gap-2 rounded border px-3 py-2 text-xs"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-muted)",
        }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: "var(--color-text-muted)", animation: "pulse 2s ease-in-out infinite" }}
        />
        Connecting to agent process...
      </div>
    );
  }

  return (
    <div>
      <ActivityBar
        activity={activity}
        isRunning={isRunning}
        expandLevel={expandLevel}
        onToggle={toggleExpand}
      />
      {expandLevel >= 1 && <EventFeed activity={activity} />}
      {expandLevel >= 2 && <RawTerminal rawOutput={activity.rawOutput} />}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/activity-panel.tsx
git commit -m "feat(activity): add 3-layer ActivityPanel component"
```

---

### Task 7: Integrate into `src/components/session-detail.tsx`

**Files:**
- Modify: `src/components/session-detail.tsx`

- [ ] **Step 1: Add imports**

At top of file, add after the existing imports (after line 12):

```typescript
import { ActivityPanel } from "./activity-panel";
import { useActivityPoll } from "@/hooks/use-activity-poll";
```

- [ ] **Step 2: Add the activity hook and panel**

Inside `SessionDetail` component, after line 37 (`const [loading, setLoading] = useState<string | null>(null);`), add:

```typescript
  const { activity, error: activityError } = useActivityPoll(
    session.id,
    session.status
  );
```

Then in the JSX, after the Strategy `<div>` block (after line 227: `{session.strategy}</div>`) and before the Metrics Row comment (`{/* Metrics Row */}`), insert:

```typescript
      {/* Live Activity */}
      {(session.status === "running" || session.status === "paused") && (
        <ActivityPanel
          activity={activity}
          error={activityError}
          isRunning={session.status === "running"}
        />
      )}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/session-detail.tsx
git commit -m "feat(activity): integrate ActivityPanel into session detail view"
```

---

### Task 8: Build, deploy, and verify

- [ ] **Step 1: Build Docker image**

Run: `docker compose build --no-cache`
Expected: Build succeeds

- [ ] **Step 2: Restart container**

Run: `docker compose up -d`
Expected: Container starts, health check passes

- [ ] **Step 3: Verify API endpoint**

Run: `curl -s http://localhost:3200/proxy/autoresearch/api/sessions/docboost-main/activity | python3 -m json.tool`
Expected: JSON response (either snapshot or 404 for no tmux)

- [ ] **Step 4: Verify frontend loads**

Run: `curl -s http://localhost:3200/proxy/autoresearch | grep "activity-panel" || echo "SSR ok (client component)"`
Expected: Page loads without errors

- [ ] **Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(activity): build and deploy activity panel"
```
