#!/usr/bin/env npx tsx
/**
 * Idempotent demo seed — creates 3 sessions with experiments for UI testing.
 * Run: npx tsx scripts/seed-demo.ts
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "autoresearch.db");

fs.mkdirSync(DB_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
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
`);

interface DemoSession {
  id: string;
  tag: string;
  status: string;
  gpu_index: number | null;
  agent_type: string;
  strategy: string;
  branch: string;
  best_val_bpb: number | null;
  experiment_count: number;
  commit_count: number;
  started_at: number | null;
  finished_at: number | null;
}

const NOW = Date.now();
const HOUR = 3600_000;

const SESSIONS: DemoSession[] = [
  {
    id: "demo-muon-01",
    tag: "muon-lr-sweep",
    status: "running",
    gpu_index: 0,
    agent_type: "claude-code",
    strategy:
      "Sweep Muon optimizer learning rates from 0.001 to 0.05. Focus on warmup schedule and weight decay interaction.",
    branch: "autoresearch/muon-lr-sweep",
    best_val_bpb: null,
    experiment_count: 0,
    commit_count: 0,
    started_at: NOW - 4 * HOUR,
    finished_at: null,
  },
  {
    id: "demo-attn-02",
    tag: "attention-variants",
    status: "running",
    gpu_index: 1,
    agent_type: "aider",
    strategy:
      "Compare FlashAttention v2, GQA, and MQA variants. Measure BPB and VRAM tradeoffs.",
    branch: "autoresearch/attention-variants",
    best_val_bpb: null,
    experiment_count: 0,
    commit_count: 0,
    started_at: NOW - 2 * HOUR,
    finished_at: null,
  },
  {
    id: "demo-emb-03",
    tag: "embed-dim-search",
    status: "completed",
    gpu_index: null,
    agent_type: "codex",
    strategy:
      "Binary search on embedding dimension between 256 and 1024. Optimize for BPB within 24GB VRAM budget.",
    branch: "autoresearch/embed-dim-search",
    best_val_bpb: null,
    experiment_count: 0,
    commit_count: 0,
    started_at: NOW - 8 * HOUR,
    finished_at: NOW - 1 * HOUR,
  },
];

function genExperiments(
  sessionId: string,
  count: number,
  baseBpb: number
): Array<{
  run_number: number;
  val_bpb: number;
  peak_vram_mb: number;
  duration_s: number;
  committed: number;
  change_summary: string;
  delta: number | null;
}> {
  const exps: Array<{
    run_number: number;
    val_bpb: number;
    peak_vram_mb: number;
    duration_s: number;
    committed: number;
    change_summary: string;
    delta: number | null;
  }> = [];

  let bestSoFar = baseBpb;
  const summaries = [
    "Adjusted learning rate schedule with cosine warmup",
    "Modified attention head count from 8 to 12",
    "Switched optimizer from AdamW to Muon",
    "Added SwiGLU activation to FFN layers",
    "Increased embedding dimension by 128",
    "Reduced weight decay from 0.1 to 0.01",
    "Added RoPE positional encoding",
    "Changed batch size from 32 to 64",
    "Modified layer normalization to RMSNorm",
    "Extended training steps by 1000",
    "Adjusted gradient clipping threshold",
    "Added dropout regularization to attention",
    "Tuned warmup steps from 100 to 500",
    "Switched to flash attention v2 kernel",
    "Modified vocab size and token embedding",
  ];

  for (let i = 0; i < count; i++) {
    const noise = (Math.random() - 0.55) * 0.015;
    const trend = -0.002 * (i / count);
    const val_bpb = Number((baseBpb + noise + trend).toFixed(4));
    const delta = val_bpb - bestSoFar;
    const committed = val_bpb < bestSoFar ? 1 : 0;
    if (committed) bestSoFar = val_bpb;

    exps.push({
      run_number: i + 1,
      val_bpb,
      peak_vram_mb: 18000 + Math.floor(Math.random() * 4000),
      duration_s: 120 + Math.floor(Math.random() * 180),
      committed,
      change_summary: summaries[i % summaries.length],
      delta: i === 0 ? null : delta,
    });
  }

  return exps;
}

const insertSession = db.prepare(`
  INSERT OR IGNORE INTO sessions
    (id, tag, status, gpu_index, agent_type, strategy, branch,
     best_val_bpb, experiment_count, commit_count, started_at, finished_at,
     created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertExp = db.prepare(`
  INSERT INTO experiments
    (session_id, run_number, val_bpb, peak_vram_mb, duration_s, committed,
     change_summary, delta)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const checkSession = db.prepare("SELECT id FROM sessions WHERE id = ?");

const experimentConfigs: Array<{ sessionIndex: number; count: number; baseBpb: number }> = [
  { sessionIndex: 0, count: 15, baseBpb: 1.012 },
  { sessionIndex: 1, count: 8, baseBpb: 1.005 },
  { sessionIndex: 2, count: 22, baseBpb: 0.998 },
];

const seedAll = db.transaction(() => {
  for (let si = 0; si < SESSIONS.length; si++) {
    const s = SESSIONS[si];
    const existing = checkSession.get(s.id) as { id: string } | undefined;
    if (existing) {
      process.stdout.write(`[skip] Session "${s.tag}" already exists\n`);
      continue;
    }

    const cfg = experimentConfigs[si];
    const experiments = genExperiments(s.id, cfg.count, cfg.baseBpb);

    const committed = experiments.filter((e) => e.committed);
    const bestBpb =
      committed.length > 0
        ? Math.min(...committed.map((e) => e.val_bpb))
        : Math.min(...experiments.map((e) => e.val_bpb));

    insertSession.run(
      s.id,
      s.tag,
      s.status,
      s.gpu_index,
      s.agent_type,
      s.strategy,
      s.branch,
      bestBpb,
      experiments.length,
      committed.length,
      s.started_at,
      s.finished_at,
      NOW - 8 * HOUR,
      NOW
    );

    for (const exp of experiments) {
      insertExp.run(
        s.id,
        exp.run_number,
        exp.val_bpb,
        exp.peak_vram_mb,
        exp.duration_s,
        exp.committed,
        exp.change_summary,
        exp.delta
      );
    }

    process.stdout.write(
      `[seed] Session "${s.tag}" — ${experiments.length} experiments, ${committed.length} committed, best=${bestBpb.toFixed(4)}\n`
    );
  }
});

seedAll();
db.close();
process.stdout.write("[done] Demo data seeded successfully\n");
