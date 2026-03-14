import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import * as db from "./db";
import { broker } from "./sse-broker";
import { isBetter } from "./metric-utils";
import type { WatcherHandle } from "./types";

const DOCBOOST_DIR = process.env.DOCBOOST_DIR ?? "/home/lumo/docboost";
const RESULTS_DIR = path.join(DOCBOOST_DIR, "eval", "results");
const SESSION_ID = "docboost-main";
const DEBOUNCE_MS = 1000;
const MIN_DOCS = 40;

interface DocboostResult {
  method: string;
  n_docs: number;
  mean_f1: number;
  std_f1: number;
  mean_token_overhead: number;
  timestamp: string;
  per_doc: Array<{
    doc_id: string;
    category: string;
    f1: number;
  }>;
}

let watcherHandle: WatcherHandle | null = null;

function getKnownFiles(): Set<string> {
  const session = db.getSession(SESSION_ID);
  if (!session) return new Set();
  const count = db.countExperiments(SESSION_ID);
  const exps = db.getExperiments(SESSION_ID, 0, count);
  const known = new Set<string>();
  for (const e of exps) {
    if (e.log_tail) known.add(e.log_tail);
  }
  return known;
}

async function scanForNewResults(): Promise<void> {
  try {
    await fsPromises.access(RESULTS_DIR);
  } catch {
    return;
  }

  const session = db.getSession(SESSION_ID);
  if (!session) return;

  const files = (await fsPromises.readdir(RESULTS_DIR))
    .filter((f) => f.startsWith("run_") && f.endsWith("_treatment.json"))
    .sort();

  const known = getKnownFiles();
  const newFiles = files.filter((f) => !known.has(f));

  if (newFiles.length === 0) return;

  let bestVal = session.best_val_bpb;
  let expCount = session.experiment_count;

  for (const filename of newFiles) {
    const filePath = path.join(RESULTS_DIR, filename);
    try {
      const raw = await fsPromises.readFile(filePath, "utf-8");
      const data = JSON.parse(raw) as DocboostResult;

      if (data.per_doc.length < MIN_DOCS) continue;

      expCount++;
      const delta = bestVal !== null ? data.mean_f1 - bestVal : null;
      const committed =
        bestVal === null || isBetter(data.mean_f1, bestVal, session.metric_direction)
          ? 1
          : 0;

      if (committed) bestVal = data.mean_f1;

      const inserted = db.insertExperiment({
        session_id: SESSION_ID,
        run_number: expCount,
        val_bpb: data.mean_f1,
        peak_vram_mb: null,
        duration_s: null,
        committed,
        change_summary: `F1=${data.mean_f1.toFixed(1)}% (n=${data.n_docs}, overhead=${data.mean_token_overhead.toFixed(2)}x)`,
        git_hash: null,
        delta,
        log_tail: filename,
      });

      broker.broadcast({
        type: "experiment",
        sessionId: SESSION_ID,
        experiment: inserted,
      });
    } catch {
      /* skip malformed files */
    }
  }

  if (expCount !== session.experiment_count) {
    db.updateSession(SESSION_ID, {
      best_val_bpb: bestVal,
      experiment_count: expCount,
    });
  }
}

export function startDocboostWatcher(): WatcherHandle {
  if (watcherHandle) return watcherHandle;

  let stopped = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let watcher: fs.FSWatcher | null = null;

  function onFsEvent(): void {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void scanForNewResults();
    }, DEBOUNCE_MS);
  }

  try {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  } catch {
    /* dir may be read-only */
  }

  try {
    watcher = fs.watch(RESULTS_DIR, onFsEvent);
    watcher.on("error", () => {
      /* directory watch error */
    });
  } catch {
    /* directory doesn't exist — we'll just do initial scan */
  }

  void scanForNewResults();

  const handle: WatcherHandle = {
    stop() {
      stopped = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (watcher) {
        watcher.close();
        watcher = null;
      }
      watcherHandle = null;
    },
  };

  watcherHandle = handle;
  return handle;
}
