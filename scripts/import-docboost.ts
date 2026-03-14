#!/usr/bin/env npx tsx
/**
 * Import docboost research loop results into Mission Control.
 * Reads eval/results/run_*_treatment.json and research_loop*.log from the docboost repo.
 * Idempotent — skips sessions that already exist.
 *
 * Usage: npx tsx scripts/import-docboost.ts [/path/to/docboost]
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DOCBOOST_DIR = process.argv[2] ?? "/home/lumo/docboost";
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
`);

interface ResultFile {
  path: string;
  filename: string;
  method: string;
  timestamp: string;
  mean_f1: number;
  std_f1: number;
  mean_token_overhead: number;
  per_doc: Array<{
    doc_id: string;
    category: string;
    f1: number;
    answer: string;
    response: string;
    overhead: number;
    extracted_count: number;
  }>;
}

interface LogIteration {
  iteration: number;
  diagnosis: string;
  hypothesis: string;
  file: string;
  f1: number;
  kept: boolean;
  timestamp: number;
}

function parseLogFile(logPath: string): LogIteration[] {
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, "utf-8");
  const iterations: LogIteration[] = [];

  const iterRegex = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+ INFO \n?--- Iteration (\d+)\/\d+ ---/g;
  const diagRegex = /Diagnosis: (.+)/;
  const hypoRegex = /Hypothesis: (.+)/;
  const resultRegex = /Result: ([\d.]+)%/;
  const keptRegex = /IMPROVEMENT/;
  const appliedRegex = /Applied change to (.+)/;

  const lines = content.split("\n");
  let currentIter: Partial<LogIteration> = {};

  for (const line of lines) {
    const iterMatch = line.match(/--- Iteration (\d+)\/\d+ ---/);
    if (iterMatch) {
      if (currentIter.iteration !== undefined && currentIter.f1 !== undefined) {
        iterations.push(currentIter as LogIteration);
      }
      const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      currentIter = {
        iteration: Number(iterMatch[1]),
        diagnosis: "",
        hypothesis: "",
        file: "",
        f1: 0,
        kept: false,
        timestamp: dateMatch ? new Date(dateMatch[1]).getTime() : Date.now(),
      };
      continue;
    }

    const diagMatch = line.match(diagRegex);
    if (diagMatch && currentIter.iteration !== undefined) {
      currentIter.diagnosis = diagMatch[1].slice(0, 200);
    }

    const hypoMatch = line.match(hypoRegex);
    if (hypoMatch && currentIter.iteration !== undefined) {
      currentIter.hypothesis = hypoMatch[1].slice(0, 200);
    }

    const appliedMatch = line.match(appliedRegex);
    if (appliedMatch && currentIter.iteration !== undefined) {
      currentIter.file = appliedMatch[1];
    }

    const resultMatch = line.match(resultRegex);
    if (resultMatch && currentIter.iteration !== undefined) {
      currentIter.f1 = Number(resultMatch[1]);
    }

    if (keptRegex.test(line) && currentIter.iteration !== undefined) {
      currentIter.kept = true;
    }
  }

  if (currentIter.iteration !== undefined && currentIter.f1 !== undefined) {
    iterations.push(currentIter as LogIteration);
  }

  return iterations;
}

function loadResultFiles(): ResultFile[] {
  const resultsDir = path.join(DOCBOOST_DIR, "eval", "results");
  if (!fs.existsSync(resultsDir)) return [];

  return fs.readdirSync(resultsDir)
    .filter((f) => f.startsWith("run_") && f.endsWith("_treatment.json"))
    .sort()
    .map((filename) => {
      const filePath = path.join(resultsDir, filename);
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return { ...data, path: filePath, filename } as ResultFile;
    })
    .filter((r) => r.per_doc.length >= 40);
}

// Parse log files to get iteration history
const logFiles = ["research_loop.log", "research_loop2.log", "research_loop3.log"];
const allIterations: LogIteration[] = [];
for (const logFile of logFiles) {
  const logPath = path.join(DOCBOOST_DIR, logFile);
  const iters = parseLogFile(logPath);
  process.stdout.write(`[parse] ${logFile}: ${iters.length} iterations\n`);
  allIterations.push(...iters);
}

// Load all treatment result files
const resultFiles = loadResultFiles();
process.stdout.write(`[parse] ${resultFiles.length} treatment result files\n`);

// Create one session per log run (group by log file boundaries)
const SESSION_ID = "docboost-main";
const SESSION_TAG = "docboost-f1-optimization";

const checkSession = db.prepare("SELECT id FROM sessions WHERE id = ?");
const existing = checkSession.get(SESSION_ID) as { id: string } | undefined;

if (existing) {
  process.stdout.write(`[skip] Session "${SESSION_TAG}" already exists — updating experiments only\n`);
} else {
  // Find time range
  const firstResult = resultFiles[0];
  const lastResult = resultFiles[resultFiles.length - 1];
  const startTime = firstResult
    ? new Date(firstResult.timestamp).getTime()
    : Date.now() - 86400000;
  const endTime = lastResult
    ? new Date(lastResult.timestamp).getTime()
    : Date.now();

  // Compute best F1
  const bestF1 = resultFiles.reduce((best, r) => Math.max(best, r.mean_f1), 0);
  const committed = allIterations.filter((i) => i.kept).length;

  db.prepare(`
    INSERT INTO sessions
      (id, tag, status, gpu_index, agent_type, strategy, branch,
       best_val_bpb, experiment_count, commit_count, started_at, finished_at,
       created_at, updated_at, metric_name, metric_direction)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    SESSION_ID,
    SESSION_TAG,
    "paused",
    null,
    "claude-code",
    "Optimize docboost F1 score on 45 QA pairs (medicine/law/CS). Agent modifies extractor.py, stoplist.py, dedup.py, prompt_builder.py. Baseline F1: 32.5%.",
    "docboost/main",
    bestF1,
    resultFiles.length,
    committed,
    startTime,
    null,
    startTime,
    endTime,
    "f1_pct",
    "higher"
  );

  process.stdout.write(`[seed] Session "${SESSION_TAG}" created — ${resultFiles.length} experiments, best F1=${bestF1.toFixed(1)}%\n`);
}

// Insert experiments (skip already-inserted ones)
const countExps = db.prepare("SELECT COUNT(*) as c FROM experiments WHERE session_id = ?")
  .get(SESSION_ID) as { c: number };
const existingCount = countExps.c;

if (existingCount >= resultFiles.length) {
  process.stdout.write(`[skip] All ${resultFiles.length} experiments already imported\n`);
} else {
  const insertExp = db.prepare(`
    INSERT INTO experiments
      (session_id, run_number, val_bpb, peak_vram_mb, duration_s, committed,
       change_summary, delta, log_tail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let prevBest = 0;
  const insertAll = db.transaction(() => {
    for (let i = existingCount; i < resultFiles.length; i++) {
      const r = resultFiles[i];
      const matchingIter = allIterations[i] as LogIteration | undefined;
      const summary = matchingIter
        ? `${matchingIter.hypothesis} [${matchingIter.file}]`
        : `Treatment eval — mean_f1=${r.mean_f1.toFixed(1)}%`;
      const delta = i === 0 ? null : r.mean_f1 - prevBest;
      const committed = r.mean_f1 > prevBest ? 1 : 0;
      if (r.mean_f1 > prevBest) prevBest = r.mean_f1;

      const ts = new Date(r.timestamp).getTime();

      insertExp.run(
        SESSION_ID,
        i + 1,
        r.mean_f1,
        null,
        null,
        committed,
        summary.slice(0, 500),
        delta,
        r.filename,
        ts
      );
    }
  });

  insertAll();

  // Update session best
  const finalBest = Math.max(prevBest, ...resultFiles.map((r) => r.mean_f1));
  const totalCommitted = resultFiles.filter((r, i) => {
    if (i === 0) return true;
    return r.mean_f1 > Math.max(...resultFiles.slice(0, i).map((rr) => rr.mean_f1));
  }).length;

  db.prepare(`UPDATE sessions SET best_val_bpb = ?, experiment_count = ?, commit_count = ?, updated_at = ? WHERE id = ?`)
    .run(finalBest, resultFiles.length, totalCommitted, Date.now(), SESSION_ID);

  process.stdout.write(`[seed] Imported ${resultFiles.length - existingCount} new experiments (total: ${resultFiles.length})\n`);
}

db.close();
process.stdout.write("[done] Docboost data imported successfully\n");
