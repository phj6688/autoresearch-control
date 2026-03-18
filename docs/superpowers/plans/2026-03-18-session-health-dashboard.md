# Session Health & Analytics Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a background health agent that detects orphaned sessions and auto-recovers them, plus a comprehensive analytics/events UI with tab navigation.

**Architecture:** Server-side health-check loop (30s interval) reconciles DB state with tmux reality, auto-restarts orphans, escalates failures to openclaw. New `session_events` table logs all lifecycle events. UI gets top tab navigation (Sessions/Analytics/Events), enhanced session detail with last output + summaries, and a global event log.

**Tech Stack:** Next.js 15 App Router, React 19, Zustand, better-sqlite3, tmux, SSE, openclaw HTTP API

---

### Task 1: Database Schema — session_events table + session columns

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add SessionEvent type to types.ts**

Add after the `ActivitySnapshot` interface (~line 196):

```typescript
export type SessionEventType =
  | "started"
  | "orphan_detected"
  | "auto_restarted"
  | "restart_failed"
  | "escalation_triggered"
  | "escalation_resolved"
  | "killed"
  | "completed"
  | "paused"
  | "resumed"
  | "experiment_recorded"
  | "snapshot_captured";

export interface SessionEvent {
  id: number;
  session_id: string;
  type: SessionEventType;
  message: string;
  details: string | null;
  created_at: number;
}
```

Also extend the `Session` interface to include the new columns:

```typescript
// Add to Session interface:
last_output_snapshot: string | null;
last_summary: string | null;
restart_count: number;
last_restart_at: number | null;
```

Extend `SSEEvent` union:

```typescript
| { type: "health-event"; event: SessionEvent }
```

Extend `updateSession` field types to include the new columns.

- [ ] **Step 2: Add session_events table + ALTER sessions in db.ts createSchema**

Add to the `createSchema` function after the `alerts` table:

```sql
CREATE TABLE IF NOT EXISTS session_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  message         TEXT NOT NULL,
  details         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_session_events_session
  ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_type
  ON session_events(type);
```

Add migration for new session columns (safe ALTER IF NOT EXISTS pattern using try/catch):

```typescript
// After createSchema's db.exec, add:
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN last_output_snapshot TEXT`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN last_summary TEXT`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN restart_count INTEGER DEFAULT 0`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN last_restart_at INTEGER`);
} catch { /* column already exists */ }
```

- [ ] **Step 3: Add DB functions for session_events**

Add to `db.ts`:

```typescript
export function insertSessionEvent(event: {
  session_id: string;
  type: string;
  message: string;
  details?: string | null;
}): SessionEvent {
  const db = getDb();
  return withRetry(() => {
    const result = db.prepare(
      `INSERT INTO session_events (session_id, type, message, details)
       VALUES (?, ?, ?, ?)`
    ).run(event.session_id, event.type, event.message, event.details ?? null);
    return db.prepare("SELECT * FROM session_events WHERE id = ?")
      .get(result.lastInsertRowid) as SessionEvent;
  });
}

export function listSessionEvents(filters?: {
  session_id?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): SessionEvent[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.session_id) {
    conditions.push("session_id = ?");
    params.push(filters.session_id);
  }
  if (filters?.type) {
    conditions.push("type = ?");
    params.push(filters.type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters?.limit ?? 200;
  const offset = filters?.offset ?? 0;
  params.push(limit, offset);

  return withRetry(() =>
    db.prepare(
      `SELECT * FROM session_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params) as SessionEvent[]
  );
}

export function countSessionEvents(filters?: {
  session_id?: string;
  type?: string;
}): number {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.session_id) {
    conditions.push("session_id = ?");
    params.push(filters.session_id);
  }
  if (filters?.type) {
    conditions.push("type = ?");
    params.push(filters.type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return withRetry(() => {
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM session_events ${where}`
    ).get(...params) as { count: number };
    return row.count;
  });
}

export function updateSessionFields(
  id: string,
  fields: Record<string, unknown>
): void {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) return;
  setClauses.push("updated_at = (unixepoch() * 1000)");
  values.push(id);

  withRetry(() => {
    db.prepare(
      `UPDATE sessions SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);
  });
}
```

- [ ] **Step 4: Update the updateSession Pick type to include new columns**

In `db.ts`, update the `updateSession` function's `fields` parameter type to also pick `last_output_snapshot`, `last_summary`, `restart_count`, `last_restart_at`.

- [ ] **Step 5: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS (no errors related to new types)

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/types.ts
git commit -m "feat: add session_events table and health columns to sessions"
```

---

### Task 2: Health Agent — Background Watchdog

**Files:**
- Create: `src/lib/health-agent.ts`
- Create: `src/lib/summary-generator.ts`
- Create: `src/lib/openclaw-alert.ts`
- Modify: `src/app/api/stream/route.ts` (start health agent on first SSE connection)

- [ ] **Step 1: Create openclaw-alert.ts**

```typescript
import * as db from "./db";
import type { SessionEvent } from "./types";

export async function sendOpenclawAlert(message: string): Promise<void> {
  try {
    await fetch("http://localhost:7777/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* best effort — do not crash health agent for alert failure */
  }
}

export async function alertCriticalFailure(
  sessionTag: string,
  reason: string
): Promise<void> {
  const msg = `🚨 AUTORESEARCH CRITICAL: Session "${sessionTag}" failed after auto-restart. ${reason}. Agent investigating.`;
  await sendOpenclawAlert(msg);
}

export async function alertEscalationResult(
  sessionTag: string,
  result: string
): Promise<void> {
  const msg = `🔧 AUTORESEARCH: Escalation for "${sessionTag}": ${result}`;
  await sendOpenclawAlert(msg);
}
```

- [ ] **Step 2: Create summary-generator.ts**

```typescript
import type { Session } from "./types";

export function generateHeuristicSummary(
  session: Session,
  lastSnapshot: string | null
): string {
  const parts: string[] = [];

  // Duration
  if (session.started_at) {
    const durationMs = (session.finished_at ?? Date.now()) - session.started_at;
    const hours = Math.floor(durationMs / 3600000);
    const mins = Math.floor((durationMs % 3600000) / 60000);
    parts.push(hours > 0 ? `Ran ${hours}h ${mins}m` : `Ran ${mins}m`);
  }

  // Experiments
  if (session.experiment_count > 0) {
    parts.push(`${session.experiment_count} experiment${session.experiment_count > 1 ? "s" : ""} completed`);
  } else {
    parts.push("No experiments completed");
  }

  // Best metric
  if (session.best_val_bpb !== null) {
    parts.push(`Best ${session.metric_name}=${session.best_val_bpb}`);
  }

  // Last activity from snapshot
  if (lastSnapshot) {
    const lines = lastSnapshot.trim().split("\n").filter(Boolean);
    const lastLine = lines[lines.length - 1]?.trim();
    if (lastLine && lastLine.length > 0) {
      const truncated = lastLine.length > 100 ? lastLine.slice(0, 100) + "..." : lastLine;
      parts.push(`Last output: "${truncated}"`);
    }
  }

  return parts.join(". ") + ".";
}
```

- [ ] **Step 3: Create health-agent.ts**

```typescript
import * as db from "./db";
import * as pm from "./process-manager";
import { broker } from "./sse-broker";
import { captureActivity } from "./activity-parser";
import { generateHeuristicSummary } from "./summary-generator";
import { alertCriticalFailure } from "./openclaw-alert";
import type { Session } from "./types";

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const RESTART_COOLDOWN_MS = 5 * 60_000; // 5 minutes

let healthInterval: ReturnType<typeof setInterval> | null = null;

function logEvent(
  sessionId: string,
  type: string,
  message: string,
  details?: Record<string, unknown>
): void {
  try {
    const event = db.insertSessionEvent({
      session_id: sessionId,
      type,
      message,
      details: details ? JSON.stringify(details) : null,
    });
    broker.broadcast({ type: "health-event", event });
  } catch {
    /* best effort */
  }
}

async function captureSnapshot(session: Session): Promise<void> {
  if (!session.tmux_session) return;

  try {
    const activity = await captureActivity(
      session.tmux_session,
      session.worktree_path
    );
    if (activity.rawOutput) {
      db.updateSessionFields(session.id, {
        last_output_snapshot: activity.rawOutput,
      });
    }
  } catch {
    /* best effort snapshot */
  }
}

async function handleOrphan(session: Session): Promise<void> {
  // Log detection
  logEvent(session.id, "orphan_detected", `Tmux session "${session.tmux_session}" not found`, {
    expected_tmux: session.tmux_session,
    gpu_index: session.gpu_index,
    experiment_count: session.experiment_count,
  });

  // Generate heuristic summary
  const summary = generateHeuristicSummary(session, session.last_output_snapshot);
  db.updateSessionFields(session.id, { last_summary: summary });

  // Check if we're in a restart loop (died again within cooldown)
  const now = Date.now();
  if (
    session.last_restart_at &&
    now - session.last_restart_at < RESTART_COOLDOWN_MS
  ) {
    // Escalation — restart failed too recently
    logEvent(session.id, "restart_failed", "Session died again within 5 minutes of last restart", {
      last_restart_at: session.last_restart_at,
      restart_count: session.restart_count,
    });

    db.updateSession(session.id, {
      status: "failed",
      gpu_index: null,
      finished_at: now,
    });

    broker.broadcast({
      type: "session-status",
      sessionId: session.id,
      status: "failed",
    });

    logEvent(session.id, "escalation_triggered", `Auto-restart failed after ${session.restart_count} attempts. Alerting openclaw.`);

    void alertCriticalFailure(
      session.tag,
      `Died ${session.restart_count} times. Last summary: ${summary}`
    );

    return;
  }

  // Auto-restart
  try {
    // Clean up dead tmux reference
    if (session.tmux_session) {
      try {
        await pm.killSession(session.tmux_session);
      } catch {
        /* already dead */
      }
    }

    // Temporarily mark as failed so restartSession accepts it
    db.updateSession(session.id, { status: "failed" });

    // Import dynamically to avoid circular dependency
    const { restartSession } = await import("./session-lifecycle");
    await restartSession(session.id);

    const restartCount = (session.restart_count ?? 0) + 1;
    db.updateSessionFields(session.id, {
      restart_count: restartCount,
      last_restart_at: now,
    });

    logEvent(session.id, "auto_restarted", `Auto-restarted (attempt #${restartCount})`, {
      restart_count: restartCount,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logEvent(session.id, "restart_failed", `Auto-restart failed: ${reason}`);

    db.updateSession(session.id, {
      status: "failed",
      gpu_index: null,
      finished_at: now,
    });

    broker.broadcast({
      type: "session-status",
      sessionId: session.id,
      status: "failed",
    });

    logEvent(session.id, "escalation_triggered", `Auto-restart threw error. Alerting openclaw.`);
    void alertCriticalFailure(session.tag, `Restart error: ${reason}`);
  }
}

async function runHealthCheck(): Promise<void> {
  const sessions = db.listSessions();
  const activeSessions = sessions.filter(
    (s) => s.status === "running" || s.status === "paused"
  );

  for (const session of activeSessions) {
    if (!session.tmux_session) {
      // No tmux reference — definitely orphaned
      await handleOrphan(session);
      continue;
    }

    const alive = await pm.isSessionAlive(session.tmux_session);

    if (alive) {
      // Healthy — capture snapshot
      await captureSnapshot(session);
    } else {
      // Orphan detected
      await handleOrphan(session);
    }
  }
}

export function startHealthAgent(): void {
  if (healthInterval) return;

  // Run immediately on startup to catch orphans from container restart
  void runHealthCheck();

  healthInterval = setInterval(() => {
    void runHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);
}

export function stopHealthAgent(): void {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}
```

- [ ] **Step 4: Wire health agent startup into stream route**

In `src/app/api/stream/route.ts`, add:

```typescript
import { startHealthAgent } from "@/lib/health-agent";

let healthAgentStarted = false;

// Inside GET(), before the subscriber:
if (!healthAgentStarted) {
  healthAgentStarted = true;
  startHealthAgent();
}
```

- [ ] **Step 5: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/health-agent.ts src/lib/summary-generator.ts src/lib/openclaw-alert.ts src/app/api/stream/route.ts
git commit -m "feat: add health agent with orphan detection, auto-restart, and openclaw alerts"
```

---

### Task 3: Log lifecycle events from existing session-lifecycle.ts

**Files:**
- Modify: `src/lib/session-lifecycle.ts`

- [ ] **Step 1: Add event logging to existing lifecycle functions**

Import `insertSessionEvent` from db and broadcast health-events via broker:

```typescript
import { insertSessionEvent } from "./db"; // add to existing import
```

Add a helper at the top:

```typescript
function logLifecycleEvent(
  sessionId: string,
  type: string,
  message: string
): void {
  try {
    const event = insertSessionEvent({ session_id: sessionId, type, message });
    broker.broadcast({ type: "health-event", event });
  } catch { /* best effort */ }
}
```

Then add calls:
- In `promoteToRunning` after status update: `logLifecycleEvent(session.id, "started", "Session started")`
- In `pauseSession` after status update: `logLifecycleEvent(id, "paused", "Session paused")`
- In `resumeSession` after status update: `logLifecycleEvent(id, "resumed", "Session resumed")`
- In `killSession` after status update: `logLifecycleEvent(id, "killed", "Session killed by user")`
- In `onNewExperiments` after inserting experiment: `logLifecycleEvent(sessionId, "experiment_recorded", "Experiment #${exp.run_number} recorded")`

- [ ] **Step 2: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/session-lifecycle.ts
git commit -m "feat: log lifecycle events to session_events table"
```

---

### Task 4: API Routes for Events and Health Status

**Files:**
- Create: `src/app/api/events/route.ts`
- Create: `src/app/api/sessions/[id]/events/route.ts`
- Create: `src/app/api/health/status/route.ts`

- [ ] **Step 1: Create /api/events route**

```typescript
import { listSessionEvents, countSessionEvents } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest): Response {
  const url = new URL(req.url);
  const session_id = url.searchParams.get("session_id") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  try {
    const events = listSessionEvents({ session_id, type, limit, offset });
    const total = countSessionEvents({ session_id, type });
    return Response.json({ events, total, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create /api/sessions/[id]/events route**

```typescript
import { listSessionEvents, countSessionEvents, getSession } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return params.then(({ id }) => {
    const session = getSession(id);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    try {
      const events = listSessionEvents({ session_id: id, type, limit, offset });
      const total = countSessionEvents({ session_id: id, type });
      return Response.json({ events, total, limit, offset });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return Response.json({ error: message }, { status: 500 });
    }
  });
}
```

- [ ] **Step 3: Create /api/health/status route**

```typescript
import { listSessions } from "@/lib/db";
import { isSessionAlive } from "@/lib/process-manager";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const sessions = listSessions();
    const activeSessions = sessions.filter(
      (s) => s.status === "running" || s.status === "paused"
    );

    const statuses = await Promise.all(
      activeSessions.map(async (s) => {
        const alive = s.tmux_session
          ? await isSessionAlive(s.tmux_session)
          : false;
        return {
          id: s.id,
          tag: s.tag,
          status: s.status,
          tmux_alive: alive,
          healthy: alive,
          gpu_index: s.gpu_index,
          restart_count: s.restart_count,
          last_restart_at: s.last_restart_at,
          experiment_count: s.experiment_count,
          best_val_bpb: s.best_val_bpb,
        };
      })
    );

    const healthy = statuses.filter((s) => s.healthy).length;
    const unhealthy = statuses.filter((s) => !s.healthy).length;

    return Response.json({
      healthy,
      unhealthy,
      total: activeSessions.length,
      sessions: statuses,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/events/route.ts src/app/api/sessions/\[id\]/events/route.ts src/app/api/health/status/route.ts
git commit -m "feat: add API routes for events and health status"
```

---

### Task 5: Client-Side Stores and Hooks for Events

**Files:**
- Create: `src/stores/events-store.ts`
- Create: `src/hooks/use-events.ts`
- Modify: `src/hooks/use-sse.ts` (listen for health-event SSE)
- Modify: `src/stores/session-store.ts` (add view types for tabs)

- [ ] **Step 1: Create events-store.ts**

```typescript
import { create } from "zustand";
import type { SessionEvent } from "@/lib/types";

interface EventsStore {
  events: SessionEvent[];
  loading: boolean;
  total: number;
  setEvents: (events: SessionEvent[], total: number) => void;
  prependEvent: (event: SessionEvent) => void;
  setLoading: (loading: boolean) => void;
}

export const useEventsStore = create<EventsStore>((set) => ({
  events: [],
  loading: false,
  total: 0,

  setEvents: (events, total) => set({ events, total }),

  prependEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 200),
      total: state.total + 1,
    })),

  setLoading: (loading) => set({ loading }),
}));
```

- [ ] **Step 2: Create use-events.ts hook**

```typescript
"use client";

import { useEffect, useCallback } from "react";
import { useEventsStore } from "@/stores/events-store";
import { apiUrl } from "@/lib/base-path";
import type { SessionEvent } from "@/lib/types";

export function useEvents(filters?: {
  session_id?: string;
  type?: string;
}): {
  events: SessionEvent[];
  loading: boolean;
  total: number;
  refresh: () => void;
} {
  const events = useEventsStore((s) => s.events);
  const loading = useEventsStore((s) => s.loading);
  const total = useEventsStore((s) => s.total);
  const setEvents = useEventsStore((s) => s.setEvents);
  const setLoading = useEventsStore((s) => s.setLoading);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.session_id) params.set("session_id", filters.session_id);
      if (filters?.type) params.set("type", filters.type);
      params.set("limit", "200");

      const res = await fetch(apiUrl(`/api/events?${params}`));
      if (res.ok) {
        const data = (await res.json()) as { events: SessionEvent[]; total: number };
        setEvents(data.events, data.total);
      }
    } catch {
      /* network error */
    } finally {
      setLoading(false);
    }
  }, [filters?.session_id, filters?.type, setEvents, setLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { events, loading, total, refresh };
}
```

- [ ] **Step 3: Update session-store.ts to support tab navigation**

Add `"analytics" | "events"` to the view type:

```typescript
// Change:
view: "dashboard" | "compare";
// To:
view: "dashboard" | "compare" | "analytics" | "events";

// Update setView parameter type to match
```

- [ ] **Step 4: Update use-sse.ts to handle health-event**

Add a listener for `health-event` SSE events:

```typescript
es.addEventListener("health-event", (e) => {
  const data = JSON.parse(e.data) as {
    type: "health-event";
    event: SessionEvent;
  };
  // Import and use events store
  const { useEventsStore } = require("@/stores/events-store");
  useEventsStore.getState().prependEvent(data.event);
});
```

Actually, since we're using ESM, use a different pattern. Import `useEventsStore` at the top of the file and add the event listener. Also re-fetch sessions on health-event (session status may have changed).

- [ ] **Step 5: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/events-store.ts src/hooks/use-events.ts src/stores/session-store.ts src/hooks/use-sse.ts
git commit -m "feat: add events store, hook, and SSE listener for health events"
```

---

### Task 6: Tab Navigation UI

**Files:**
- Create: `src/components/tab-navigation.tsx`
- Modify: `src/components/dashboard.tsx`

- [ ] **Step 1: Create tab-navigation.tsx**

```typescript
"use client";

import { useSessionStore } from "@/stores/session-store";

const TABS = [
  { id: "dashboard" as const, label: "Sessions" },
  { id: "analytics" as const, label: "Analytics" },
  { id: "events" as const, label: "Events" },
  { id: "compare" as const, label: "Compare" },
];

export function TabNavigation() {
  const view = useSessionStore((s) => s.view);
  const setView = useSessionStore((s) => s.setView);

  return (
    <div
      className="flex border-b"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors"
          style={{
            color: view === tab.id ? "var(--color-accent)" : "var(--color-text-muted)",
            borderBottom: view === tab.id ? "2px solid var(--color-accent)" : "2px solid transparent",
          }}
          onClick={() => setView(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update dashboard.tsx to use TabNavigation**

Replace the existing header view toggle buttons (the Dashboard/Compare rounded button group) with `<TabNavigation />` placed below the header and above the StatsBar. Remove the old toggle from the header.

Update `MainContent` to handle the new view types: `"analytics"` renders `<AnalyticsView />`, `"events"` renders `<EventsView />`.

- [ ] **Step 3: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/tab-navigation.tsx src/components/dashboard.tsx
git commit -m "feat: add tab navigation with Sessions/Analytics/Events/Compare tabs"
```

---

### Task 7: Analytics View

**Files:**
- Create: `src/components/analytics-view.tsx`

- [ ] **Step 1: Create analytics-view.tsx**

Show:
- **Health Status Cards**: For each active session, show tag, status, healthy/orphan indicator, experiment count, best metric, restart count
- **Global Stats**: Total experiments, total commits, average velocity, total restarts
- **Session Health Grid**: Cards with green/red health indicators based on tmux alive status

Fetch from `/api/health/status` on mount and poll every 30s.

Use the existing CSS variable theme. Cards use `var(--color-surface)` background, `var(--color-border)` borders. Health indicators: green `var(--color-success)` for healthy, red `var(--color-error)` for unhealthy.

The component should show:
1. A top row of summary stats (healthy count, unhealthy count, total restarts)
2. A grid of session health cards
3. Each card shows: tag, status badge, health dot, experiment count, best metric, restart count, last restart time

- [ ] **Step 2: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics-view.tsx
git commit -m "feat: add analytics view with session health cards and global stats"
```

---

### Task 8: Events View

**Files:**
- Create: `src/components/events-view.tsx`

- [ ] **Step 1: Create events-view.tsx**

A filterable, scrollable event log:
- Filter bar: dropdown for session tag (from all sessions), dropdown for event type
- Event list: each row shows timestamp, session tag, event type badge (color-coded), message
- Expandable detail: click event to show JSON details
- Auto-updates via SSE (new events prepend to top)
- "Load more" button for pagination

Use `useEvents` hook for data fetching. Color-code event types:
- `orphan_detected`, `restart_failed`, `escalation_triggered`: red
- `auto_restarted`, `escalation_resolved`: amber/warning
- `started`, `resumed`, `experiment_recorded`: green
- `killed`, `paused`, `completed`: neutral/muted

- [ ] **Step 2: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/events-view.tsx
git commit -m "feat: add events view with filterable event log"
```

---

### Task 9: Enhanced Session Detail — Last Output + Summary for Dead Sessions

**Files:**
- Modify: `src/components/session-detail.tsx`
- Create: `src/components/output-viewer.tsx`
- Create: `src/components/session-event-timeline.tsx`

- [ ] **Step 1: Create output-viewer.tsx**

A component that shows the heuristic summary collapsed, expandable to the last raw output snapshot:

```typescript
"use client";

import { useState } from "react";
import { ChevronIcon, TerminalIcon } from "./icons";

interface OutputViewerProps {
  summary: string | null;
  rawOutput: string | null;
}

export function OutputViewer({ summary, rawOutput }: OutputViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!summary && !rawOutput) return null;

  return (
    <div
      className="rounded border"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        <TerminalIcon size={14} />
        <span style={{ color: "var(--color-text-secondary)" }}>
          {summary ?? "Last captured output"}
        </span>
        <span
          className="ml-auto shrink-0 transition-transform"
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
          className="overflow-auto border-t px-3 py-2 text-xs leading-relaxed"
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
```

- [ ] **Step 2: Create session-event-timeline.tsx**

Fetches events for the session and renders a vertical timeline:

```typescript
"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/base-path";
import type { SessionEvent } from "@/lib/types";

// Color mapping for event types
const EVENT_COLORS: Record<string, string> = {
  started: "var(--color-success)",
  orphan_detected: "var(--color-error)",
  auto_restarted: "var(--color-warning)",
  restart_failed: "var(--color-error)",
  escalation_triggered: "var(--color-error)",
  escalation_resolved: "var(--color-success)",
  killed: "var(--color-text-muted)",
  completed: "var(--color-success)",
  paused: "var(--color-warning)",
  resumed: "var(--color-success)",
  experiment_recorded: "var(--color-accent)",
  snapshot_captured: "var(--color-text-muted)",
};

interface SessionEventTimelineProps {
  sessionId: string;
}

export function SessionEventTimeline({ sessionId }: SessionEventTimelineProps) {
  const [events, setEvents] = useState<SessionEvent[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl(`/api/sessions/${sessionId}/events?limit=50`));
        if (res.ok) {
          const data = (await res.json()) as { events: SessionEvent[] };
          setEvents(data.events);
        }
      } catch { /* ignore */ }
    }
    void load();
  }, [sessionId]);

  if (events.length === 0) return null;

  return (
    <div>
      <div
        className="mb-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        Session Events
      </div>
      <div
        className="rounded border p-3"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          maxHeight: "200px",
          overflowY: "auto",
        }}
      >
        {events.map((event) => {
          const color = EVENT_COLORS[event.type] ?? "var(--color-text-muted)";
          const time = new Date(event.created_at).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          const date = new Date(event.created_at).toLocaleDateString("en-GB", {
            month: "short",
            day: "numeric",
          });
          return (
            <div key={event.id} className="flex items-start gap-2 py-1">
              <span
                className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span
                className="shrink-0 tabular-nums text-xs"
                style={{ color: "var(--color-text-muted)", minWidth: "7em" }}
              >
                {date} {time}
              </span>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                  color,
                  fontSize: "10px",
                }}
              >
                {event.type.replace(/_/g, " ")}
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
    </div>
  );
}
```

- [ ] **Step 3: Update session-detail.tsx**

Add imports for `OutputViewer` and `SessionEventTimeline`.

Modify the component to:

1. For dead/orphan sessions (status killed/failed/completed, or running but orphan), show the `OutputViewer` with `session.last_summary` and `session.last_output_snapshot` — place it where the ActivityPanel currently goes.

2. Add `SessionEventTimeline` after the metrics row for all sessions.

3. For orphan detection: enhance the existing `isOrphan` check. If session status is "running" but tmux_session is null, show a warning banner:

```tsx
{session.status === "running" && isOrphan && (
  <div
    className="flex items-center gap-2 rounded border px-3 py-2 text-xs"
    style={{
      borderColor: "var(--color-warning)",
      backgroundColor: "rgba(245, 158, 11, 0.1)",
      color: "var(--color-warning)",
    }}
  >
    <WarningIcon size={14} />
    <span>Session appears orphaned — no active process detected. Health agent will auto-restart.</span>
  </div>
)}
```

4. Show the `OutputViewer` for any non-running session that has `last_summary` or `last_output_snapshot`:

```tsx
{session.status !== "running" && (session.last_summary || session.last_output_snapshot) && (
  <OutputViewer
    summary={session.last_summary}
    rawOutput={session.last_output_snapshot}
  />
)}
```

- [ ] **Step 4: Run typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/output-viewer.tsx src/components/session-event-timeline.tsx src/components/session-detail.tsx
git commit -m "feat: enhanced session detail with last output, summary, event timeline, and orphan warning"
```

---

### Task 10: Integration Test — Build + Smoke Test

**Files:**
- No new files

- [ ] **Step 1: Run full typecheck**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && pnpm lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Run build**

Run: `cd /home/lumo/autoresearch_foundation/autoresearch-control && pnpm build`
Expected: PASS — Next.js production build succeeds

- [ ] **Step 4: Rebuild and deploy Docker container**

```bash
cd /home/lumo/autoresearch_foundation/autoresearch-control && docker compose up -d --build --force-recreate
```
Expected: Container starts successfully

- [ ] **Step 5: Smoke test API endpoints**

```bash
# Health status
curl -s http://localhost:3200/proxy/autoresearch/api/health/status | head -c 500

# Events list
curl -s http://localhost:3200/proxy/autoresearch/api/events?limit=10 | head -c 500

# Sessions list still works
curl -s http://localhost:3200/proxy/autoresearch/api/sessions | head -c 500
```

Expected: All return valid JSON

- [ ] **Step 6: Verify health agent ran on startup**

Check if the orphaned docboost-f1 session was detected and handled:

```bash
curl -s http://localhost:3200/proxy/autoresearch/api/events?type=orphan_detected | head -c 500
```

Expected: Should show the orphan_detected event for docboost-f1

- [ ] **Step 7: Final commit and notify**

```bash
git add -A
git commit -m "feat: session health dashboard — complete with health agent, analytics, events, and auto-recovery"
```

Then notify openclaw:
```bash
curl -s http://localhost:7777/api/messages -X POST -H "Content-Type: application/json" -d '{"text":"Task complete: Session health dashboard deployed. Health agent running with orphan detection + auto-restart. New tabs: Analytics + Events. Enhanced session detail with last output + summary for dead sessions."}'
```
