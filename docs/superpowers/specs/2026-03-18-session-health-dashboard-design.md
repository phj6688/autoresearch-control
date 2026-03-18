# Session Health & Analytics Dashboard — Design Spec

## Problem
When the autoresearch-control container restarts, tmux sessions die but the DB still shows them as "running". The UI shows blank output with no explanation. There is no event history, no health monitoring, and no auto-recovery.

## Solution: 3 Layers

### Layer A: Health Agent (Background Watchdog)

Server-side interval loop (every 30s) that reconciles DB state with tmux reality.

**Health check cycle:**
1. Query all sessions with `status = running | paused`
2. For each, check `tmux has-session`
3. If alive: capture last 200 lines from tmux, store as `last_output_snapshot` on session row
4. If dead (orphan):
   - Log `orphan_detected` event
   - Read last snapshot + log file, generate heuristic summary
   - Auto-restart immediately (re-spawn tmux, same worktree/GPU)
   - Log `auto_restarted` event
   - If restart fails OR session dies again within 5 min:
     - Log `escalation_triggered` event
     - Mark session `failed`
     - Call openclaw to diagnose & fix
     - Alert via openclaw: critical failure notification

**Startup reconciliation:** Run health check immediately on server boot.

**Output persistence:**
- Every 30s: capture last 200 lines from tmux → `sessions.last_output_snapshot` (DB)
- Continuous: pipe tmux output to `session.log` in worktree via `tmux pipe-pane`
- On death: heuristic summary from last snapshot (regex-based, no AI cost)
- On escalation: AI agent generates detailed analysis

**Openclaw integration:**
- Critical alerts only: unrecoverable failures, escalation events, sessions dead >5min after retry
- POST to `http://localhost:7777/api/messages` or `openclaw message`

### Layer B: Tab Navigation + Analytics Dashboard

**Top tab navigation** replacing current single-view layout:
- **Sessions** — current session list + detail view (unchanged)
- **Analytics** — global health overview and experiment metrics
- **Events** — chronological event log

**Analytics tab contents:**
- Health status cards per session (healthy/orphan/failed/idle)
- Experiment velocity chart (experiments/hour over time)
- Success rate (committed vs discarded experiments)
- Global best metrics across all sessions
- GPU utilization per session

**Events tab contents:**
- Chronological event log from `session_events` table
- Filterable by session tag and event type
- Expandable detail per event (JSON details, output snapshot)
- Auto-refreshes via SSE

### Layer C: Enhanced Session Detail

**For dead/orphan sessions:**
- Clear status indicator: "Session orphaned — auto-restart in progress" or "Failed — agent investigating"
- Last known output from `last_output_snapshot`, shown as collapsed summary expandable to raw output
- Heuristic summary: "Ran 38 min, 1 experiment completed (F1=63.45%), died during experiment loop"

**Session event timeline:**
- Visual timeline: started → experiment → orphaned → restarted → ...
- Events from `session_events` table

**Alert history:** Per-session alerts with timestamps

## DB Changes

### New table: `session_events`
```sql
CREATE TABLE session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,  -- JSON blob
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX idx_session_events_session ON session_events(session_id);
CREATE INDEX idx_session_events_type ON session_events(type);
```

Event types: `started`, `orphan_detected`, `auto_restarted`, `restart_failed`, `escalation_triggered`, `escalation_resolved`, `killed`, `completed`, `paused`, `resumed`, `experiment_recorded`, `snapshot_captured`

### New column on `sessions`
```sql
ALTER TABLE sessions ADD COLUMN last_output_snapshot TEXT;
ALTER TABLE sessions ADD COLUMN last_summary TEXT;
ALTER TABLE sessions ADD COLUMN restart_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN last_restart_at INTEGER;
```

## New API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/events` | GET | List events, query params: `session_id`, `type`, `limit`, `offset` |
| `/api/events/stream` | GET | SSE endpoint for real-time event updates |
| `/api/sessions/[id]/events` | GET | Events for specific session |
| `/api/health/status` | GET | Health status of all sessions (alive/orphan/failed) |

## New SSE Event Types
```typescript
| { type: "health-event"; event: SessionEvent }
| { type: "health-status"; sessions: HealthStatus[] }
```

## New Files

### Server-side
- `src/lib/health-agent.ts` — Health check loop, orphan detection, auto-restart, escalation
- `src/lib/summary-generator.ts` — Heuristic summary from output snapshots
- `src/lib/openclaw-alert.ts` — Openclaw notification integration
- `src/app/api/events/route.ts` — Events list API
- `src/app/api/sessions/[id]/events/route.ts` — Per-session events API
- `src/app/api/health/status/route.ts` — Health status API

### Client-side
- `src/components/tab-navigation.tsx` — Top tab bar
- `src/components/analytics-view.tsx` — Analytics dashboard tab
- `src/components/events-view.tsx` — Event log tab
- `src/components/session-event-timeline.tsx` — Per-session event timeline
- `src/components/output-viewer.tsx` — Collapsed summary + expandable raw output
- `src/stores/events-store.ts` — Zustand store for events
- `src/hooks/use-events.ts` — Events fetching/SSE hook

## Recovery Flow

```
Session dies (tmux gone)
  │
  ├─ Health agent detects (within 30s)
  │   ├─ Log orphan_detected event
  │   ├─ Capture heuristic summary from last snapshot
  │   └─ Auto-restart session
  │       ├─ Success → log auto_restarted, continue monitoring
  │       └─ Failure OR dies again within 5 min
  │           ├─ Log escalation_triggered
  │           ├─ Mark session failed
  │           ├─ Alert via openclaw (critical)
  │           └─ Dispatch agent to diagnose & fix
  │               ├─ Fixed → log escalation_resolved, restart
  │               └─ Cannot fix → alert user with diagnosis
```

## Decisions Made
- **Auto-restart always** on orphan detection, no manual intervention needed
- **Escalation to AI agent** when auto-restart fails (not just alert)
- **Critical alerts only** via openclaw — no digests, no routine notifications
- **Heuristic summaries** for routine deaths, AI analysis only on escalation
- **Top tab navigation** for Sessions/Analytics/Events separation
- **Output snapshots every 30s** (raw capture, no AI) + full log file in worktree
- **Summary on death only** (not every 30s) to save costs
