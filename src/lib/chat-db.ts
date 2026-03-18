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
