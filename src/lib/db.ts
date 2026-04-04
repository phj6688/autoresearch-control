import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { nanoid } from "nanoid";
import type {
  Session,
  SessionEvent,
  Experiment,
  CreateSessionInput,
} from "./types";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "autoresearch.db");

function openDatabase(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

let _db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (!_db) {
    _db = openDatabase();
    createSchema(_db);
  }
  return _db;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,
      tag             TEXT NOT NULL UNIQUE,
      status          TEXT NOT NULL DEFAULT 'queued'
                      CHECK(status IN ('queued','running','paused','completed','failed','killed')),
      gpu_index       INTEGER,
      agent_type      TEXT NOT NULL,
      strategy        TEXT NOT NULL,
      branch          TEXT NOT NULL,
      worktree_path   TEXT,
      seed_from       TEXT,
      tmux_session    TEXT,
      program_md      TEXT,
      best_val_bpb    REAL,
      experiment_count INTEGER DEFAULT 0,
      commit_count    INTEGER DEFAULT 0,
      started_at      INTEGER,
      finished_at     INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      metric_name     TEXT NOT NULL DEFAULT 'val_bpb',
      metric_direction TEXT NOT NULL DEFAULT 'lower'
                       CHECK(metric_direction IN ('lower','higher'))
    );

    CREATE TABLE IF NOT EXISTS experiments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      run_number      INTEGER NOT NULL,
      val_bpb         REAL NOT NULL,
      peak_vram_mb    REAL,
      duration_s      REAL,
      committed       INTEGER NOT NULL DEFAULT 0,
      change_summary  TEXT,
      git_hash        TEXT,
      delta           REAL,
      log_tail        TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_experiments_session
      ON experiments(session_id, run_number);

    CREATE TABLE IF NOT EXISTS gpu_assignments (
      gpu_index       INTEGER PRIMARY KEY,
      session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      assigned_at     INTEGER
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      type            TEXT NOT NULL CHECK(type IN ('breakthrough','failure','completed','stall')),
      message         TEXT NOT NULL,
      sent            INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS session_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      type            TEXT NOT NULL,
      message         TEXT NOT NULL,
      details         TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(type);
  `);

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

  try { db.exec(`ALTER TABLE sessions ADD COLUMN last_output_snapshot TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE sessions ADD COLUMN last_summary TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE sessions ADD COLUMN restart_count INTEGER DEFAULT 0`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE sessions ADD COLUMN last_restart_at INTEGER`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE experiments ADD COLUMN annotation TEXT`); } catch { /* exists */ }
}

export function withRetry<T>(fn: () => T): T {
  const MAX_RETRIES = 3;
  const BACKOFF_MS = 100;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return fn();
    } catch (err: unknown) {
      const isBusy =
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "SQLITE_BUSY";
      if (!isBusy || attempt === MAX_RETRIES - 1) {
        throw err;
      }
      const waitMs = BACKOFF_MS * (attempt + 1);
      const end = Date.now() + waitMs;
      while (Date.now() < end) {
        /* busy wait */
      }
    }
  }
  throw new Error("withRetry: unreachable");
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return withRetry(() =>
    db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | Session
      | undefined
  );
}

export function listSessions(): Session[] {
  const db = getDb();
  return withRetry(() =>
    db
      .prepare("SELECT * FROM sessions ORDER BY created_at DESC")
      .all() as Session[]
  );
}

export function insertSession(input: CreateSessionInput): Session {
  const db = getDb();
  const id = nanoid(12);
  const branch = `autoresearch/${input.tag}`;
  return withRetry(() => {
    db.prepare(
      `INSERT INTO sessions (id, tag, status, gpu_index, agent_type, strategy, branch, seed_from, program_md, metric_name, metric_direction)
       VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.tag,
      input.gpu_index ?? null,
      input.agent_type,
      input.strategy,
      branch,
      input.seed_from ?? null,
      input.program_md ?? null,
      input.metric_name ?? "val_bpb",
      input.metric_direction ?? "lower"
    );
    return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session;
  });
}

export function updateSession(
  id: string,
  fields: Partial<
    Pick<
      Session,
      | "status"
      | "gpu_index"
      | "worktree_path"
      | "tmux_session"
      | "best_val_bpb"
      | "experiment_count"
      | "commit_count"
      | "started_at"
      | "finished_at"
      | "last_output_snapshot"
      | "last_summary"
      | "restart_count"
      | "last_restart_at"
    >
  >
): Session | undefined {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) {
    return getSession(id);
  }

  setClauses.push("updated_at = (unixepoch() * 1000)");
  values.push(id);

  return withRetry(() => {
    db.prepare(
      `UPDATE sessions SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);
    return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | Session
      | undefined;
  });
}

export function deleteSession(id: string): boolean {
  const db = getDb();
  return withRetry(() => {
    const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  });
}

export function insertExperiment(
  exp: Omit<Experiment, "id" | "created_at">
): Experiment {
  const db = getDb();
  return withRetry(() => {
    const result = db
      .prepare(
        `INSERT INTO experiments (session_id, run_number, val_bpb, peak_vram_mb, duration_s, committed, change_summary, git_hash, delta, log_tail, annotation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        exp.session_id,
        exp.run_number,
        exp.val_bpb,
        exp.peak_vram_mb ?? null,
        exp.duration_s ?? null,
        exp.committed,
        exp.change_summary ?? null,
        exp.git_hash ?? null,
        exp.delta ?? null,
        exp.log_tail ?? null,
        exp.annotation ?? null
      );
    return db
      .prepare("SELECT * FROM experiments WHERE id = ?")
      .get(result.lastInsertRowid) as Experiment;
  });
}

export function getExperiments(
  sessionId: string,
  offset = 0,
  limit = 1000
): Experiment[] {
  const db = getDb();
  return withRetry(() =>
    db
      .prepare(
        "SELECT * FROM experiments WHERE session_id = ? ORDER BY run_number ASC LIMIT ? OFFSET ?"
      )
      .all(sessionId, limit, offset) as Experiment[]
  );
}

export function countExperiments(sessionId: string): number {
  const db = getDb();
  return withRetry(() => {
    const row = db
      .prepare("SELECT COUNT(*) as count FROM experiments WHERE session_id = ?")
      .get(sessionId) as { count: number };
    return row.count;
  });
}

export function getAssignedGpuIndexes(): number[] {
  const db = getDb();
  return withRetry(() => {
    const rows = db
      .prepare(
        "SELECT gpu_index FROM sessions WHERE status = 'running' AND gpu_index IS NOT NULL"
      )
      .all() as Array<{ gpu_index: number }>;
    return rows.map((r) => r.gpu_index);
  });
}

export function getSessionByTag(tag: string): Session | undefined {
  const db = getDb();
  return withRetry(() =>
    db.prepare("SELECT * FROM sessions WHERE tag = ?").get(tag) as
      | Session
      | undefined
  );
}

export function getSessionCounts(): {
  running: number;
  queued: number;
  total: number;
} {
  const db = getDb();
  return withRetry(() => {
    const total = (
      db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number }
    ).c;
    const running = (
      db
        .prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'running'")
        .get() as { c: number }
    ).c;
    const queued = (
      db
        .prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'queued'")
        .get() as { c: number }
    ).c;
    return { running, queued, total };
  });
}

export function getNextQueuedSession(): Session | undefined {
  const db = getDb();
  return withRetry(() =>
    db
      .prepare(
        "SELECT * FROM sessions WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
      )
      .get() as Session | undefined
  );
}

export function insertAlert(alert: {
  session_id: string;
  type: string;
  message: string;
  sent: number;
}): void {
  const db = getDb();
  withRetry(() => {
    db.prepare(
      `INSERT INTO alerts (session_id, type, message, sent) VALUES (?, ?, ?, ?)`
    ).run(alert.session_id, alert.type, alert.message, alert.sent);
  });
}

export function insertSessionEvent(event: {
  session_id: string;
  type: string;
  message: string;
  details?: string | null;
}): SessionEvent {
  const db = getDb();
  return withRetry(() => {
    const result = db
      .prepare(
        `INSERT INTO session_events (session_id, type, message, details) VALUES (?, ?, ?, ?)`
      )
      .run(
        event.session_id,
        event.type,
        event.message,
        event.details ?? null
      );
    return db
      .prepare("SELECT * FROM session_events WHERE id = ?")
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
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;
  params.push(limit, offset);

  return withRetry(() =>
    db
      .prepare(
        `SELECT * FROM session_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params) as SessionEvent[]
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
    const row = db
      .prepare(`SELECT COUNT(*) as count FROM session_events ${where}`)
      .get(...params) as { count: number };
    return row.count;
  });
}

export function updateExperimentAnnotation(
  experimentId: number,
  sessionId: string,
  annotation: string | null
): Experiment | undefined {
  const db = getDb();
  return withRetry(() => {
    const existing = db
      .prepare("SELECT * FROM experiments WHERE id = ? AND session_id = ?")
      .get(experimentId, sessionId) as Experiment | undefined;
    if (!existing) return undefined;

    db.prepare("UPDATE experiments SET annotation = ? WHERE id = ?").run(
      annotation,
      experimentId
    );
    return db
      .prepare("SELECT * FROM experiments WHERE id = ?")
      .get(experimentId) as Experiment;
  });
}
