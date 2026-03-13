import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { parseResultsTsv } from "./results-parser";
import type { ParsedExperiment, WatcherHandle } from "./types";

const DEBOUNCE_MS = 500;

export function watchSession(
  sessionId: string,
  worktreePath: string,
  onExperiment: (sessionId: string, experiments: ParsedExperiment[]) => void
): WatcherHandle {
  const tsvPath = path.join(worktreePath, "results.tsv");
  let lastKnownCount = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let watcher: fs.FSWatcher | null = null;

  async function processChange(): Promise<void> {
    if (stopped) return;
    try {
      const content = await fsPromises.readFile(tsvPath, "utf-8");
      const parsed = parseResultsTsv(content);
      if (parsed.length > lastKnownCount) {
        const newExperiments = parsed.slice(lastKnownCount);
        lastKnownCount = parsed.length;
        onExperiment(sessionId, newExperiments);
      }
    } catch {
      /* file may not exist yet or be mid-write */
    }
  }

  function startWatching(): void {
    try {
      watcher = fs.watch(tsvPath, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void processChange();
        }, DEBOUNCE_MS);
      });

      watcher.on("error", () => {
        /* silently handle — file may disappear temporarily */
      });
    } catch {
      /* file doesn't exist yet — retry after delay */
      if (!stopped) {
        setTimeout(startWatching, 2000);
      }
    }
  }

  void processChange().then(() => {
    if (!stopped) startWatching();
  });

  return {
    stop() {
      stopped = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
}
