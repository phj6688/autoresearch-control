# Global AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an embedded AI chat assistant to the Autoresearch Mission Control dashboard that can answer questions about sessions, experiments, and live activity with full context from DB, git, and tmux.

**Architecture:** Slide-out chat drawer in the dashboard, powered by Anthropic API via a streaming POST endpoint. Context assembled per-request from SQLite, git history, and live tmux capture. Conversations persisted to SQLite.

**Tech Stack:** Next.js 15 App Router, React 19, Zustand 5, @anthropic-ai/sdk, better-sqlite3, simple-git, SSE streaming via ReadableStream

**Spec:** `docs/superpowers/specs/2026-03-18-global-assistant-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/chat-db.ts` | SQLite operations for chat_conversations and chat_messages tables |
| `src/lib/chat-context.ts` | Assembles tiered context (sessions, experiments, git, tmux) for each chat request |
| `src/app/api/chat/route.ts` | POST endpoint — assembles context, streams Anthropic API response |
| `src/app/api/chat/conversations/route.ts` | GET — list conversations |
| `src/app/api/chat/conversations/[id]/route.ts` | GET messages / DELETE conversation |
| `src/stores/chat-store.ts` | Zustand store — drawer open/close, active conversation, toast queue |
| `src/hooks/use-chat.ts` | Hook — send messages, consume streaming response, manage message state |
| `src/components/chat-drawer.tsx` | Slide-out drawer — message list, input, streaming display |
| `src/components/chat-message.tsx` | Single message bubble — markdown rendering, clickable references |
| `src/components/toast-container.tsx` | Toast notification stack — experiment completion alerts |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/db.ts` | Add chat_conversations + chat_messages table creation to schema init |
| `src/components/dashboard.tsx` | Add chat toggle button in header, mount ChatDrawer + ToastContainer |
| `src/hooks/use-sse.ts` | Add toast dispatch on `experiment` SSE event |
| `src/components/activity-panel.tsx` | Remove expand level 2 (raw terminal), cap at level 1 |
| `docker-compose.yml` | Add ANTHROPIC_API_KEY and ASSISTANT_MODEL env vars |
| `package.json` | Add @anthropic-ai/sdk dependency |

---

## Task 1: Add @anthropic-ai/sdk dependency and env vars

**Files:**
- Modify: `package.json`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Install the Anthropic SDK**

```bash
cd /home/lumo/autoresearch_foundation/autoresearch-control
pnpm add @anthropic-ai/sdk
```

- [ ] **Step 2: Add env vars to docker-compose.yml**

In `docker-compose.yml`, add to the `environment` section of the `mission-control` service:

```yaml
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ASSISTANT_MODEL=${ASSISTANT_MODEL:-claude-sonnet-4-20250514}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors (SDK types available but not yet imported anywhere)

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml docker-compose.yml
git commit -m "feat(chat): add @anthropic-ai/sdk dependency and env vars"
```

---

## Task 2: Database schema — chat tables

**Files:**
- Modify: `src/lib/db.ts` (add table creation in `openDatabase()`)
- Create: `src/lib/chat-db.ts`

- [ ] **Step 1: Add chat tables to db.ts schema init**

In `src/lib/db.ts`, inside the `openDatabase()` function, after the existing `CREATE TABLE IF NOT EXISTS session_events` block, add:

```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id          TEXT PRIMARY KEY,
      title       TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id  TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content          TEXT NOT NULL,
      session_context  TEXT,
      created_at       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
      ON chat_messages(conversation_id);
  `);
```

- [ ] **Step 2: Create src/lib/chat-db.ts**

```typescript
import { nanoid } from "nanoid";
import { getDb, withRetry } from "./db";

export interface ChatConversation {
  id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: number;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  session_context: string | null;
  created_at: number;
}

export function createConversation(title?: string): ChatConversation {
  const db = getDb();
  const id = nanoid(12);
  const now = Date.now();
  return withRetry(() => {
    db.prepare(
      `INSERT INTO chat_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`
    ).run(id, title ?? null, now, now);
    return { id, title: title ?? null, created_at: now, updated_at: now };
  });
}

export function listConversations(): ChatConversation[] {
  const db = getDb();
  return withRetry(() =>
    db.prepare(
      `SELECT * FROM chat_conversations ORDER BY updated_at DESC`
    ).all() as ChatConversation[]
  );
}

export function getConversation(id: string): ChatConversation | undefined {
  const db = getDb();
  return withRetry(() =>
    db.prepare(`SELECT * FROM chat_conversations WHERE id = ?`).get(id) as
      | ChatConversation
      | undefined
  );
}

export function deleteConversation(id: string): void {
  const db = getDb();
  withRetry(() =>
    db.prepare(`DELETE FROM chat_conversations WHERE id = ?`).run(id)
  );
}

export function insertMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  sessionContext?: string
): ChatMessage {
  const db = getDb();
  const now = Date.now();
  return withRetry(() => {
    const result = db
      .prepare(
        `INSERT INTO chat_messages (conversation_id, role, content, session_context, created_at) VALUES (?, ?, ?, ?, ?)`
      )
      .run(conversationId, role, content, sessionContext ?? null, now);
    db.prepare(
      `UPDATE chat_conversations SET updated_at = ? WHERE id = ?`
    ).run(now, conversationId);

    // Auto-generate title from first user message
    const conv = db
      .prepare(`SELECT title FROM chat_conversations WHERE id = ?`)
      .get(conversationId) as { title: string | null } | undefined;
    if (conv && conv.title === null && role === "user") {
      const title = content.length > 60
        ? content.slice(0, content.lastIndexOf(" ", 60)) || content.slice(0, 60)
        : content;
      db.prepare(
        `UPDATE chat_conversations SET title = ? WHERE id = ?`
      ).run(title, conversationId);
    }

    return {
      id: Number(result.lastInsertRowid),
      conversation_id: conversationId,
      role,
      content,
      session_context: sessionContext ?? null,
      created_at: now,
    };
  });
}

export function getMessages(
  conversationId: string,
  limit = 50
): ChatMessage[] {
  const db = getDb();
  return withRetry(() =>
    db
      .prepare(
        `SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`
      )
      .all(conversationId, limit) as ChatMessage[]
  );
}
```

- [ ] **Step 3: Export getDb and withRetry from db.ts**

In `src/lib/db.ts`, both `getDb` and `withRetry` are currently private. Add `export` to both declarations:

```typescript
export function getDb(): Database.Database { ... }
export function withRetry<T>(fn: () => T): T { ... }
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/chat-db.ts
git commit -m "feat(chat): add chat database schema and operations"
```

---

## Task 3: Context assembler

**Files:**
- Create: `src/lib/chat-context.ts`

- [ ] **Step 1: Create the context assembler**

```typescript
import * as db from "./db";
import * as chatDb from "./chat-db";
import { captureActivity } from "./activity-parser";
import { getBranchLog, getCommitDiffStats } from "./git";
import type { Session } from "./types";

const SYSTEM_PROMPT = `You are the Autoresearch Mission Control assistant. You help the user understand and manage their autonomous research sessions.

Behavior:
- Be concise and direct — no filler, no "Great question!"
- Explain technical concepts in plain language that a non-engineer can understand
- When describing experiments: explain what was changed, why it was tried, whether it worked, and what it means for next steps
- Use project metric names naturally ("F1 improved from 65.9% to 68.4%" not "val_bpb increased")
- When helping create sessions: ask about the goal, suggest a strategy, recommend agent/GPU/metric settings
- When asked about live state: describe what the agent is doing based on tmux output

Boundaries:
- You have read-only access — you cannot execute commands or modify sessions
- If asked to take action, tell the user which buttons to press in the UI
- Say "I don't have enough context to answer that" rather than guessing`;

function formatSessions(sessions: Session[]): string {
  if (sessions.length === 0) return "No active sessions.";
  return sessions
    .map((s) => {
      const duration = s.started_at
        ? `${Math.round((Date.now() - s.started_at) / 60000)}m`
        : "not started";
      return `- ${s.tag} [${s.status}] agent=${s.agent_type} metric=${s.metric_name} best=${s.best_val_bpb ?? "none"} experiments=${s.experiment_count} duration=${duration}`;
    })
    .join("\n");
}

function formatExperiments(
  experiments: Array<{
    run_number: number;
    val_bpb: number;
    change_summary: string | null;
    delta: number | null;
    committed: number;
  }>
): string {
  if (experiments.length === 0) return "No experiments yet.";
  return experiments
    .map((e) => {
      const tag = e.committed ? "KEPT" : "DISCARDED";
      const delta = e.delta !== null ? ` (delta: ${e.delta > 0 ? "+" : ""}${e.delta.toFixed(2)})` : "";
      return `- Run #${e.run_number}: ${e.val_bpb.toFixed(2)}${delta} [${tag}] — ${e.change_summary ?? "no description"}`;
    })
    .join("\n");
}

interface ContextOptions {
  message: string;
  conversationId: string;
  sessionId?: string;
}

export async function assembleContext(
  options: ContextOptions
): Promise<{ systemPrompt: string; conversationHistory: Array<{ role: "user" | "assistant"; content: string }> }> {
  const { message, conversationId, sessionId } = options;
  const msgLower = message.toLowerCase();

  // Always-included: all sessions overview
  const sessions = db.listSessions();
  let contextParts: string[] = [
    "## Current Sessions",
    formatSessions(sessions),
  ];

  // Session-focused: if a session is selected or mentioned by name
  let focusedSession: Session | undefined;
  if (sessionId) {
    focusedSession = db.getSession(sessionId);
  } else {
    focusedSession = sessions.find((s) =>
      msgLower.includes(s.tag.toLowerCase())
    );
  }

  if (focusedSession) {
    const experiments = db.getExperiments(focusedSession.id);
    const events = db.listSessionEvents({ session_id: focusedSession.id });

    contextParts.push(
      `\n## Focused Session: ${focusedSession.tag}`,
      `Status: ${focusedSession.status}`,
      `Agent: ${focusedSession.agent_type}`,
      `Strategy: ${focusedSession.strategy}`,
      `Metric: ${focusedSession.metric_name} (${focusedSession.metric_direction} is better)`,
      `Best: ${focusedSession.best_val_bpb ?? "none"}`,
      `Restarts: ${focusedSession.restart_count}`,
      `\n### Experiments`,
      formatExperiments(experiments),
    );

    if (events.length > 0) {
      contextParts.push(
        `\n### Recent Events`,
        events
          .slice(0, 10)
          .map((e) => `- [${e.type}] ${e.message}`)
          .join("\n")
      );
    }

    // On-demand: live tmux output
    const wantsLive =
      /what.*(happen|doing|running|now|current|status|live|active)/i.test(message);
    if (wantsLive && focusedSession.tmux_session) {
      try {
        const activity = await captureActivity(
          focusedSession.tmux_session,
          focusedSession.worktree_path
        );
        contextParts.push(
          `\n### Live Activity`,
          `Status: ${activity.status}`,
          `Summary: ${activity.summary}`,
          `Modified files: ${activity.modifiedFiles.join(", ") || "none"}`,
          `\nRaw terminal output (last 50 lines):`,
          "```",
          activity.rawOutput,
          "```"
        );
      } catch {
        contextParts.push(
          `\n### Live Activity`,
          "Could not capture tmux output."
        );
      }
    }

    // On-demand: git diffs
    const wantsDiff =
      /what.*(chang|diff|modif)|show.*(code|change|diff)|explain.*(change|experiment)/i.test(message);
    if (wantsDiff && focusedSession.worktree_path) {
      try {
        const log = await getBranchLog(focusedSession.worktree_path, 5);
        contextParts.push(
          `\n### Recent Git Commits`,
          log
            .map((c) => `- ${c.hash.slice(0, 7)} ${c.message}`)
            .join("\n")
        );

        // Get diff stats for the most recent commit
        if (log.length > 0) {
          const stats = await getCommitDiffStats(
            focusedSession.worktree_path,
            log[0].hash
          );
          if (stats.files.length > 0) {
            contextParts.push(
              `\nLatest commit diff stats:`,
              stats.files
                .map(
                  (s) =>
                    `  ${s.file}: +${s.insertions} -${s.deletions}`
                )
                .join("\n")
            );
          }
        }
      } catch {
        contextParts.push(`\n### Git History`, "Could not read git log.");
      }
    }
  }

  // Conversation history
  const history = chatDb
    .getMessages(conversationId, 20)
    .map((m) => ({ role: m.role, content: m.content }));

  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${contextParts.join("\n")}`;

  return { systemPrompt: fullSystemPrompt, conversationHistory: history };
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Check that `db.getExperiments`, `db.listSessionEvents`, `db.getSession`, and `db.listSessions` signatures match usage. Adjust types if needed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/chat-context.ts
git commit -m "feat(chat): add tiered context assembler"
```

---

## Task 4: Chat API route — streaming endpoint

**Files:**
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 1: Create the streaming chat endpoint**

```typescript
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { assembleContext } from "@/lib/chat-context";
import * as chatDb from "@/lib/chat-db";

export const dynamic = "force-dynamic";

const getClient = (() => {
  let client: Anthropic | null = null;
  return () => {
    if (!client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY not configured");
      }
      client = new Anthropic({ apiKey });
    }
    return client;
  };
})();

export async function POST(request: NextRequest): Promise<Response> {
  let body: { conversationId?: string; message?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  const { message, sessionId } = body;
  let { conversationId } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
    });
  }

  // Create or validate conversation
  if (!conversationId) {
    const conv = chatDb.createConversation();
    conversationId = conv.id;
  } else {
    const existing = chatDb.getConversation(conversationId);
    if (!existing) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404 }
      );
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Immediate status event to keep proxy alive
      sendEvent("status", {
        status: "assembling_context",
        conversationId,
      });

      // Heartbeat during context assembly (proxy survival)
      const heartbeatInterval = setInterval(() => {
        sendEvent("heartbeat", {});
      }, 5000);

      try {
        const client = getClient();
        const model =
          process.env.ASSISTANT_MODEL || "claude-sonnet-4-20250514";

        // Assemble context BEFORE storing user message to avoid duplication in history
        const { systemPrompt, conversationHistory } = await assembleContext({
          message: message.trim(),
          conversationId,
          sessionId,
        });

        clearInterval(heartbeatInterval);

        // Store user message AFTER context assembly
        chatDb.insertMessage(conversationId, "user", message.trim(), sessionId);

        // Add the new user message to history
        const messages = [
          ...conversationHistory.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user" as const, content: message.trim() },
        ];

        sendEvent("status", { status: "streaming" });

        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages,
          stream: true,
        });

        let fullResponse = "";

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullResponse += event.delta.text;
            sendEvent("token", { text: event.delta.text });
          }
        }

        // Store assistant response
        chatDb.insertMessage(
          conversationId,
          "assistant",
          fullResponse,
          sessionId
        );

        sendEvent("done", { conversationId });
      } catch (err: unknown) {
        const error = err as { status?: number; message?: string };
        if (error.status === 429 || error.status === 529) {
          sendEvent("error", {
            message: "Service temporarily unavailable, try again in a moment",
          });
        } else if (error.status === 401) {
          sendEvent("error", { message: "API key invalid" });
        } else {
          sendEvent("error", {
            message: error.message || "An unexpected error occurred",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 3: Test with curl**

```bash
curl -X POST http://localhost:3200/proxy/autoresearch/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What sessions are running?"}' \
  --no-buffer
```

Expected: SSE stream with `event: status`, `event: token` (multiple), `event: done`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): add streaming chat API endpoint"
```

---

## Task 5: Conversations API routes

**Files:**
- Create: `src/app/api/chat/conversations/route.ts`
- Create: `src/app/api/chat/conversations/[id]/route.ts`

- [ ] **Step 1: Create conversations list route**

```typescript
// src/app/api/chat/conversations/route.ts
import { NextResponse } from "next/server";
import * as chatDb from "@/lib/chat-db";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  try {
    const conversations = chatDb.listConversations();
    return NextResponse.json(conversations);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create conversation detail/delete route**

```typescript
// src/app/api/chat/conversations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as chatDb from "@/lib/chat-db";

export const dynamic = "force-dynamic";

export function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return params.then(({ id }) => {
    try {
      const conversation = chatDb.getConversation(id);
      if (!conversation) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      const messages = chatDb.getMessages(id);
      return NextResponse.json({ conversation, messages });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

export function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return params.then(({ id }) => {
    try {
      chatDb.deleteConversation(id);
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 4: Test with curl**

```bash
curl -s http://localhost:3200/proxy/autoresearch/api/chat/conversations | python3 -m json.tool
```

Expected: JSON array (may be empty or have conversations from Task 4 testing)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/conversations/
git commit -m "feat(chat): add conversations list and detail API routes"
```

---

## Task 6: Zustand chat store

**Files:**
- Create: `src/stores/chat-store.ts`

- [ ] **Step 1: Create the chat store**

```typescript
import { create } from "zustand";

export interface Toast {
  id: string;
  sessionId: string;
  sessionTag: string;
  message: string;
  createdAt: number;
}

interface ChatState {
  drawerOpen: boolean;
  activeConversationId: string | null;
  toasts: Toast[];

  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setActiveConversation: (id: string | null) => void;
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  drawerOpen: false,
  activeConversationId: null,
  toasts: [],

  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  setActiveConversation: (id) => set({ activeConversationId: id }),

  addToast: (toast) =>
    set((s) => {
      const id = `toast-${++toastCounter}`;
      const newToast = { ...toast, id, createdAt: Date.now() };
      // Max 3 toasts, FIFO
      const toasts = [...s.toasts, newToast].slice(-3);
      return { toasts };
    }),

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/chat-store.ts
git commit -m "feat(chat): add Zustand chat store with toast queue"
```

---

## Task 7: use-chat hook — message management and streaming

**Files:**
- Create: `src/hooks/use-chat.ts`

- [ ] **Step 1: Create the chat hook**

```typescript
import { useState, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/base-path";
import { useChatStore } from "@/stores/chat-store";

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export function useChat(sessionId?: string) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(
    useChatStore.getState().activeConversationId
  );

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(
        apiUrl(`/api/chat/conversations/${convId}`)
      );
      if (!res.ok) return;
      const data = await res.json();
      conversationIdRef.current = convId;
      useChatStore.getState().setActiveConversation(convId);
      setMessages(
        data.messages.map(
          (m: { id: number; role: string; content: string; created_at: number }) => ({
            id: String(m.id),
            role: m.role as "user" | "assistant",
            content: m.content,
            createdAt: m.created_at,
          })
        )
      );
    } catch {
      setError("Failed to load conversation");
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;

      setError(null);
      const userMsg: DisplayMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: content.trim(),
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);

      const assistantMsg: DisplayMessage = {
        id: `local-${Date.now()}-assistant`,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(apiUrl("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationIdRef.current,
            message: content.trim(),
            sessionId,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ") && eventType) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === "token") {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content + data.text,
                      };
                    }
                    return updated;
                  });
                } else if (eventType === "done" && data.conversationId) {
                  conversationIdRef.current = data.conversationId;
                  useChatStore
                    .getState()
                    .setActiveConversation(data.conversationId);
                } else if (eventType === "error") {
                  setError(data.message);
                }
              } catch {
                // Skip malformed JSON
              }
              eventType = "";
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "Connection failed");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, sessionId]
  );

  const newConversation = useCallback(() => {
    conversationIdRef.current = null;
    useChatStore.getState().setActiveConversation(null);
    setMessages([]);
    setError(null);
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    streaming,
    error,
    sendMessage,
    loadConversation,
    newConversation,
    cancelStream,
  };
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-chat.ts
git commit -m "feat(chat): add useChat hook with SSE stream parsing"
```

---

## Task 8: Chat message component

**Files:**
- Create: `src/components/chat-message.tsx`

- [ ] **Step 1: Create the message component**

```typescript
"use client";

import type { DisplayMessage } from "@/hooks/use-chat";

interface ChatMessageProps {
  message: DisplayMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed"
        style={{
          backgroundColor: isUser
            ? "var(--color-accent)"
            : "var(--color-surface)",
          color: isUser ? "var(--color-bg)" : "var(--color-text-primary)",
          borderColor: isUser ? "transparent" : "var(--color-border)",
          borderWidth: isUser ? 0 : 1,
        }}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {isStreaming && message.role === "assistant" && (
          <span
            className="ml-0.5 inline-block h-3 w-1 animate-pulse"
            style={{ backgroundColor: "var(--color-accent)" }}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat-message.tsx
git commit -m "feat(chat): add chat message bubble component"
```

---

## Task 9: Toast container component

**Files:**
- Create: `src/components/toast-container.tsx`
- Modify: `src/hooks/use-sse.ts`

- [ ] **Step 1: Create the toast container**

```typescript
"use client";

import { useEffect } from "react";
import { useChatStore, type Toast } from "@/stores/chat-store";
import { useSessionStore } from "@/stores/session-store";

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleClick = () => {
    // Navigate to the session, then dismiss
    const { selectSession } = useSessionStore.getState();
    const { setView } = useSessionStore.getState();
    selectSession(toast.sessionId);
    setView("dashboard");
    onDismiss();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-72 rounded-lg border px-3 py-2 text-left text-xs shadow-lg transition-opacity"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-accent)",
        color: "var(--color-text-primary)",
      }}
    >
      <div className="font-semibold" style={{ color: "var(--color-accent)" }}>
        {toast.sessionTag}
      </div>
      <div className="mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
        {toast.message}
      </div>
    </button>
  );
}

export function ToastContainer() {
  const toasts = useChatStore((s) => s.toasts);
  const removeToast = useChatStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-14 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={() => removeToast(t.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add toast dispatch to use-sse.ts**

In `src/hooks/use-sse.ts`, inside the `experiment` event handler (after the existing `addExperiment` call), add:

```typescript
import { useChatStore } from "@/stores/chat-store";
```

Then in the experiment handler block, after `addExperiment(data.sessionId, data.experiment)`:

```typescript
// Toast notification for experiment completion
const session = useSessionStore.getState().sessions.find(
  (s) => s.id === data.sessionId
);
const metricVal = data.experiment.val_bpb?.toFixed(2) ?? "?";
const delta = data.experiment.delta;
const deltaStr = delta !== null && delta !== undefined
  ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(2)})`
  : "";
useChatStore.getState().addToast({
  sessionId: data.sessionId,
  sessionTag: session?.tag ?? data.sessionId,
  message: `Exp #${data.experiment.run_number} — ${metricVal}${deltaStr}`,
});
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/toast-container.tsx src/hooks/use-sse.ts
git commit -m "feat(chat): add toast notifications for experiment completion"
```

---

## Task 10: Chat drawer component

**Files:**
- Create: `src/components/chat-drawer.tsx`

- [ ] **Step 1: Create the chat drawer**

```typescript
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useChat } from "@/hooks/use-chat";
import { useSessionStore } from "@/stores/session-store";
import { ChatMessage } from "./chat-message";
import { ErrorBoundary } from "./error-boundary";

function ChatDrawerInner() {
  const drawerOpen = useChatStore((s) => s.drawerOpen);
  const closeDrawer = useChatStore((s) => s.closeDrawer);
  const selectedId = useSessionStore((s) => s.selectedId);
  const sessions = useSessionStore((s) => s.sessions);

  const selectedSession = sessions.find((s) => s.id === selectedId);

  const { messages, streaming, error, sendMessage, newConversation } =
    useChat(selectedId ?? undefined);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when drawer opens
  useEffect(() => {
    if (drawerOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [drawerOpen]);

  const handleSend = useCallback(() => {
    if (input.trim() && !streaming) {
      sendMessage(input);
      setInput("");
    }
  }, [input, streaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (!drawerOpen) return null;

  return (
    <div
      className="flex h-full w-[420px] shrink-0 flex-col border-l"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-accent)" }}
          >
            Assistant
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => newConversation()}
            className="rounded px-2 py-1 text-[10px] font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--color-text-secondary)" }}
            title="New conversation"
          >
            New
          </button>
          <button
            type="button"
            onClick={closeDrawer}
            className="rounded px-2 py-1 text-[10px] font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div
            className="mt-8 text-center text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <div className="mb-2 text-lg">💬</div>
            <div>Ask about your sessions, experiments, or get help writing a new strategy.</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isStreaming={streaming && i === messages.length - 1}
          />
        ))}
        {error && (
          <div
            className="mt-2 rounded px-3 py-2 text-xs"
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.1)",
              color: "var(--color-error)",
            }}
          >
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Context indicator + Input */}
      <div
        className="border-t px-3 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        {selectedSession && (
          <div
            className="mb-1 text-[10px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Viewing: {selectedSession.tag}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 resize-none rounded border bg-transparent px-2 py-1.5 text-xs outline-none"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            placeholder="Ask anything..."
            disabled={streaming}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            {streaming ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatDrawer() {
  return (
    <ErrorBoundary fallbackLabel="Chat">
      <ChatDrawerInner />
    </ErrorBoundary>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat-drawer.tsx
git commit -m "feat(chat): add slide-out chat drawer component"
```

---

## Task 11: Dashboard integration

**Files:**
- Modify: `src/components/dashboard.tsx`

- [ ] **Step 1: Add imports to dashboard.tsx**

At the top of `src/components/dashboard.tsx`, add:

```typescript
import { ChatDrawer } from "./chat-drawer";
import { ToastContainer } from "./toast-container";
import { useChatStore } from "@/stores/chat-store";
```

- [ ] **Step 2: Add chat toggle button in header**

In the header section, next to the "New Session" button, add a chat toggle button:

```typescript
const toggleDrawer = useChatStore((s) => s.toggleDrawer);
const drawerOpen = useChatStore((s) => s.drawerOpen);
```

Then in the JSX, immediately before the "New Session" button:

```tsx
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
  💬
  <span className="hidden sm:inline">Assistant</span>
</button>
```

- [ ] **Step 3: Mount ChatDrawer in the main content area**

In the main flex container (the `<div className="flex flex-1 overflow-hidden">` that holds the sidebar and main content), add `<ChatDrawer />` as the last child — after `</main>`:

```tsx
<div className="flex flex-1 overflow-hidden">
  {/* ... existing sidebar ... */}
  <main className="flex-1 overflow-y-auto p-4 md:p-6">
    {/* ... existing content ... */}
  </main>
  <ChatDrawer />
</div>
```

- [ ] **Step 4: Mount ToastContainer**

Add `<ToastContainer />` at the very end of the Dashboard return, just before the closing `</div>`:

```tsx
  <ToastContainer />
</div>
```

- [ ] **Step 5: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 6: Verify the UI renders**

```bash
curl -s http://localhost:3200/proxy/autoresearch -o /dev/null -w "%{http_code}"
```

Expected: 200. Open in browser to verify the chat toggle button appears in the header.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard.tsx
git commit -m "feat(chat): integrate chat drawer and toasts into dashboard"
```

---

## Task 12: Simplify activity panel

**Files:**
- Modify: `src/components/activity-panel.tsx`

- [ ] **Step 1: Remove raw terminal expand level**

In `src/components/activity-panel.tsx`, change the toggle cycle from 0→1→2→0 to 0→1→0:

Find:
```typescript
setExpandLevel((prev) => (prev >= 2 ? 0 : prev + 1));
```

Replace with:
```typescript
setExpandLevel((prev) => (prev >= 1 ? 0 : 1));
```

- [ ] **Step 2: Remove the RawTerminal section**

Remove the conditional render block for `expandLevel >= 2` that shows the raw terminal output (the `<pre>` block with raw tmux output). Keep everything for levels 0 and 1 (ActivityBar and EventFeed).

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/activity-panel.tsx
git commit -m "refactor(chat): remove raw terminal from activity panel"
```

---

## Task 13: Build and smoke test

- [ ] **Step 1: Run full typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Fix any lint errors.

- [ ] **Step 3: Build production**

```bash
pnpm build
```

Expected: successful build with no errors

- [ ] **Step 4: Rebuild Docker and verify**

```bash
cd /home/lumo/autoresearch_foundation/autoresearch-control
docker compose up -d --build --force-recreate
```

Wait for container to be healthy, then:

```bash
curl -s http://localhost:3200/proxy/autoresearch -o /dev/null -w "%{http_code}"
curl -s http://localhost:3200/proxy/autoresearch/api/health
```

Expected: 200, health OK

- [ ] **Step 5: Test chat endpoint end-to-end**

```bash
curl -X POST http://localhost:3200/proxy/autoresearch/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is docboost-f1 doing right now?"}' \
  --no-buffer 2>&1 | head -20
```

Expected: SSE stream with context about the running session

- [ ] **Step 6: Run Maestro E2E tests**

```bash
./maestro/run.sh
```

Expected: all existing flows pass (chat drawer doesn't break existing UI)

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address build and lint issues"
```
