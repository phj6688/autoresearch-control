# Activity Panel — Live Agent Monitoring

**Date:** 2026-03-16
**Status:** Approved

## Problem

When a session is "running", the UI shows a status badge and metrics but zero visibility into what the agent is actually doing. After clicking Resume, there's no feedback that anything is happening.

## Solution

A 3-layer progressive-disclosure activity panel in the session detail view.

## Architecture

### Backend

**New file: `src/lib/activity-parser.ts`**

Two data sources:
1. **Tmux capture** — `tmux capture-pane -p -t <session> -S -50` for last 50 lines. Regex patterns detect file operations, experiment lifecycle, agent state, errors.
2. **Git enrichment** — `git status --porcelain` + `git diff --stat` in worktree for actual modified files.

Returns `ActivitySnapshot`:
```typescript
interface ActivityEvent {
  ts: number;
  type: "modifying" | "experimenting" | "evaluating" | "thinking" | "committing" | "error" | "reading" | "idle";
  message: string;
}

interface ActivitySnapshot {
  status: "experimenting" | "modifying" | "evaluating" | "thinking" | "idle" | "error";
  summary: string;
  events: ActivityEvent[];
  rawOutput: string;
  modifiedFiles: string[];
  lastActivityAt: number;
}
```

**New API route: `GET /api/sessions/[id]/activity`**

Returns ActivitySnapshot. Only works when session has a tmux_session. Returns 404 if no tmux session attached.

### Frontend

**New component: `src/components/activity-panel.tsx`**

Placed in session-detail.tsx after the Strategy box, before Metrics Row. Only visible when session status is `running` or `paused`.

**Layer 1 — Activity Bar (always visible, single line)**
- Pulsing green dot (running) or static amber dot (paused)
- Summary text: `● Modifying extractor.py — Experiment #40 — 12s ago`
- Click to expand. Chevron indicates expandability.

**Layer 2 — Event Feed (first expand)**
- Last 10-15 structured events in compact list
- Each event: timestamp (HH:MM:SS) + icon per type + message
- Event types with distinct colors: modifying=cyan, experimenting=purple, evaluating=green, thinking=muted, committing=yellow, error=red
- Modified files as small tags below the feed
- "Show terminal" link to expand to Layer 3

**Layer 3 — Raw Terminal (second expand)**
- Monospace pre block, dark background, scrollable, max-height 300px
- Auto-scrolls to bottom
- Last 50 lines of tmux capture

**Polling:** `useActivityPoll` hook polls every 3 seconds when session is running. Stops when paused/unmounted. Force re-fetch on SSE experiment events.

### Edge Cases

- No tmux session → "No live process attached" (muted)
- Paused → last snapshot, static amber dot, poll once on expand
- tmux died → "Agent process not responding"
- No recent activity → "Idle — last activity 5m ago"

### Performance

- Activity endpoint: ~6ms (tmux 1ms + git 5ms)
- 3s polling = 0.3 req/s — negligible
- Raw output already in response, rendered only when Layer 3 expanded
