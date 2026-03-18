# Global AI Assistant for Autoresearch Mission Control

**Date:** 2026-03-18
**Status:** Approved

## Problem

The Autoresearch Mission Control UI cannot show what running sessions are actually doing. The activity panel shows "idle" when agents are actively running evaluations because tmux output doesn't match hardcoded regex patterns. Users must run `docker exec` commands to understand session state. Experiment descriptions are one-line summaries that lack context — users can't understand what changed, why, or what it means.

## Solution

A global AI assistant embedded in the dashboard as a slide-out chat drawer. The assistant has full read-only access to all sessions, experiments, git history, code diffs, and live tmux output. It answers questions about session activity, explains experiments in plain language, and helps write strategies for new sessions.

## Architecture

### Three New Components

1. **Chat API** (`POST /api/chat`) — receives user messages, assembles context from DB + git + tmux, calls Anthropic API, streams response back via SSE.

2. **Chat UI** — a slide-out drawer (right edge, ~420px wide) with message history, input field, and streaming response display. Toggled by a header button.

3. **Context Assembler** (`src/lib/chat-context.ts`) — server-side module that gathers relevant context for each message from multiple sources.

### Data Flow

```
User types question
  → POST /api/chat { message, conversationId, sessionId? }
  → Context assembler gathers: sessions + experiments + git + tmux
  → Anthropic API call with streaming (same model as autoresearch agents)
  → SSE stream tokens back to client
  → Messages stored in SQLite for conversation history
```

The assistant is stateless per-request — each message re-assembles fresh context from the live system. Conversation history is included for continuity but context is never stale.

## Error Handling

### API Key Validation
On server startup (first chat request), validate that `ANTHROPIC_API_KEY` env var exists and is non-empty. If missing, return `500 { error: "ANTHROPIC_API_KEY not configured" }` immediately — do not attempt an API call.

### Anthropic API Errors
- **Rate limit (429) / Overloaded (529):** Stream a `status` event to the client: `{ status: "error", message: "Service temporarily unavailable, try again in a moment" }`. Do not retry automatically — let the user resend.
- **Auth error (401):** Stream error: `{ status: "error", message: "API key invalid" }`.
- **Mid-stream disconnection:** Close the SSE stream cleanly. Client shows partial response with an error indicator ("Response interrupted — try again").
- **Token limit exceeded:** Pre-estimate token count before sending. If estimated >100K, truncate conversation history (drop oldest messages first) until within budget.

### SSE Proxy Survival
The `/api/chat` SSE stream must send an immediate `status` event within the first second of connection: `event: status\ndata: {"status":"assembling_context"}\n\n`. This prevents proxy timeout during context assembly. Once Anthropic tokens start flowing, the continuous stream keeps the connection alive. If context assembly takes >10s (e.g., slow git operation), send periodic heartbeat events every 5s.

### Git Lock Safety
All git operations in `chat-context.ts` must use the existing `withMutex` lock from `src/lib/git.ts` to prevent concurrent git operations on the same worktree. Prefer reading from cached DB state (`experiment.change_summary`, `experiment.git_hash`) over live `git diff` when possible. Only call live `git diff` when the user explicitly asks about code changes and the DB summary is insufficient.

## Context Assembly

Tiered context strategy to keep token usage efficient:

### Always Included (every message)
- System prompt with role definition and project overview
- All sessions: tag, status, agent type, best metric, experiment count, duration
- Conversation history (last 20 messages)

### Session-Focused (when a session is selected or mentioned by name)
- Full experiment list with change_summary, delta, metric value
- Session strategy text
- Session event history (restarts, orphan detections, etc.)

### On-Demand (triggered by keyword heuristics in the message)
- **Git diffs**: "what changed" → `git diff` for relevant commits
- **Live tmux**: "what's happening now" / "currently" → last 50 lines from tmux capture
- **Code files**: "show me" / "current code" → read files from worktree

### Token Budget
Per-tier allocation (total target: ~15K input tokens):
- System prompt: ~1K tokens
- Session overview (all sessions): ~2K tokens
- Conversation history: ~6K tokens (truncate oldest messages first to fit)
- Session-focused context (experiments, strategy, events): ~3K tokens
- On-demand context (git diffs, tmux, code files): ~2K tokens
- Buffer: ~1K tokens

Truncation strategy: if total exceeds budget, drop oldest conversation messages first, then truncate on-demand context (git diffs), then truncate experiment history to most recent N.

## Chat UI

### Layout
- Drawer slides in from the right, 420px wide, full height below the header
- Session detail and sidebar compress to make room (not overlaid)
- Toggle button in the header bar, next to "+ New Session"
- Drawer header: "Assistant" label + minimize button

### Message Display
- User messages right-aligned (dark surface), assistant messages left-aligned (lighter surface)
- Assistant messages render markdown (code blocks, bold, lists) in the app's monospace font
- Streaming responses appear token by token with a subtle cursor
- Experiment/session references are clickable links that navigate to the relevant item

### Input Area
- Text input at bottom with send button
- Shift+Enter for newline, Enter to send
- Context indicator above input: "Viewing: docboost-f1" when a session is selected

### Client-Side Streaming
The browser's `EventSource` API only supports GET requests. Since `/api/chat` is POST-based, the client must use `fetch()` with `response.body.getReader()` and a `TextDecoder` to manually parse the `text/event-stream` format. Pattern: read chunks, split by `\n\n`, parse `event:` and `data:` lines, dispatch to state.

All fetch/EventSource URLs must use `apiUrl()` from `src/lib/base-path.ts` to include the basePath prefix.

### Conversation Persistence
- Messages stored in SQLite (`chat_messages` table)
- One active conversation at a time — reopening the drawer shows the latest
- "New conversation" button clears context and starts fresh

## Toast Notifications

When an experiment completes, a toast appears top-right:
- Format: "docboost-f1: Exp #4 — F1 68.35% (+2.47)"
- Auto-dismisses after 5 seconds
- Click navigates to that session
- Triggered by the existing SSE `experiment` event
- State lives in `chat-store.ts` (toast queue, max 3 visible, FIFO)
- `useSSE` hook's experiment handler dispatches a toast action alongside `addExperiment`

## Database Schema

### New Tables

```sql
CREATE TABLE chat_conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE chat_messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  session_context  TEXT,  -- session ID that was in focus when message was sent (nullable)
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id);
```

## API Routes

### Chat
- `POST /api/chat` — send message, get streamed response. Body: `{ conversationId, message, sessionId? }`. Returns SSE stream.
- `GET /api/chat/conversations` — list conversations.
- `GET /api/chat/conversations/[id]` — get all messages for a conversation.
- `DELETE /api/chat/conversations/[id]` — delete a conversation.

### Existing Routes (unchanged)
All existing session, experiment, GPU, health, and SSE routes remain unchanged.

## Server-Side Dependencies

- `@anthropic-ai/sdk` — for Anthropic API calls. Uses `ANTHROPIC_API_KEY` env var (already present in docker-compose for autoresearch agents).
- Model configured via `ASSISTANT_MODEL` env var, defaulting to `claude-sonnet-4-20250514`. Use Sonnet for fast responses; user can override to Opus for deeper analysis.
- Existing: `better-sqlite3`, `simple-git` (for diffs), activity-parser (for tmux capture)

## System Prompt

Role: "You are the Autoresearch Mission Control assistant. You help the user understand and manage their autonomous research sessions."

Behavior:
- Concise and direct — no filler
- Explains technical concepts in plain language
- When describing experiments: what changed, why it was tried, whether it worked, what it means
- Uses project metric names naturally ("F1 improved" not "val_bpb increased")
- When helping create sessions: asks about goal, suggests strategy, recommends settings
- When asked about live state: describes activity from tmux output

Boundaries:
- Read-only access — cannot execute commands or modify sessions
- If asked to take action, tells the user which buttons to press
- Says "I don't have enough context" rather than guessing

## Component Inventory

### New Files
- `src/app/api/chat/route.ts` — chat message endpoint with streaming
- `src/app/api/chat/conversations/route.ts` — list conversations
- `src/app/api/chat/conversations/[id]/route.ts` — get/delete conversation
- `src/lib/chat-context.ts` — context assembler
- `src/lib/chat-db.ts` — chat database operations
- `src/components/chat-drawer.tsx` — slide-out chat UI
- `src/components/chat-message.tsx` — individual message rendering
- `src/components/toast.tsx` — experiment completion toast
- `src/hooks/use-chat.ts` — chat state management hook
- `src/stores/chat-store.ts` — Zustand store for chat state (open/closed, active conversation)

### Modified Files
- `src/components/dashboard.tsx` — add chat drawer toggle button, integrate drawer in `<ErrorBoundary>`, add toast container
- `src/components/activity-panel.tsx` — remove raw terminal expand level (level 3), keep summary + event feed only
- `src/lib/db.ts` — add chat tables to schema initialization
- `src/hooks/use-sse.ts` — add toast dispatch on `experiment` event
- `docker-compose.yml` — add `ANTHROPIC_API_KEY` and `ASSISTANT_MODEL` env vars
- `package.json` — add `@anthropic-ai/sdk` dependency

### Implementation Notes
- All new API routes must export `export const dynamic = "force-dynamic"` (Next.js convention in this project)
- `chat-store.ts` follows the same Zustand pattern as existing `session-store.ts` (actions inline in `create()`)
- Chat history is preserved when sessions are deleted (no FK cascade — `session_context` is a plain string)
- Conversation `title` is auto-generated from the first user message (first 60 chars, trimmed at word boundary)

## Non-Functional Requirements

- Chat responses must start streaming within 2 seconds
- Context assembly must complete within 500ms (DB queries + optional git/tmux)
- Toast notifications must appear within 1 second of SSE experiment event
- Chat drawer open/close animation: 200ms ease-out
- SQLite chat tables use WAL mode (same as existing DB)
- All DB operations wrapped in try/catch with 3x retry on busy (per CLAUDE.md rules)

## Out of Scope

- Chat cannot execute commands or modify sessions
- No multi-user support — single user, single active conversation
- No chat history search
- No file upload to chat
- No voice input
- Raw terminal view removed from activity panel (replaced by assistant)
