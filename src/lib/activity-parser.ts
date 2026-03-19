import { execFile } from "node:child_process";
import { promisify } from "node:util";
import simpleGit from "simple-git";
import type { ActivityEvent, ActivitySnapshot, ActivityStatus, ActivityType } from "./types";

const execFileAsync = promisify(execFile);

// --- Tmux capture ---

async function captureTmuxPane(tmuxSession: string, lines = 50): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane", "-p", "-t", tmuxSession, "-S", `-${lines}`,
    ], { timeout: 5000 });
    return stdout;
  } catch {
    return "";
  }
}

// --- Git status ---

async function getModifiedFiles(worktreePath: string): Promise<string[]> {
  try {
    const git = simpleGit({ baseDir: worktreePath, maxConcurrentProcesses: 1 });
    const status = await git.status();
    const files = [
      ...status.modified,
      ...status.not_added,
      ...status.created,
      ...status.staged,
    ];
    return [...new Set(files)];
  } catch {
    return [];
  }
}

// --- Event parsing ---

interface PatternRule {
  pattern: RegExp;
  type: ActivityType;
  extract: (match: RegExpMatchArray, line: string) => string;
}

const PATTERNS: PatternRule[] = [
  {
    pattern: /(?:reading|opening|loading)\s+[`"']?([^\s`"']+)/i,
    type: "reading",
    extract: (m) => `Reading ${m[1]}`,
  },
  {
    pattern: /(?:modifying|editing|updating|writing|changing)\s+[`"']?([^\s`"']+)/i,
    type: "modifying",
    extract: (m) => `Modifying ${m[1]}`,
  },
  {
    pattern: /(?:running experiment|experiment\s*#?\s*(\d+)|starting experiment)/i,
    type: "experimenting",
    extract: (m) => m[1] ? `Running experiment #${m[1]}` : "Starting experiment",
  },
  {
    pattern: /(?:evaluating|eval[:\s]|computing.*(?:metric|score|f1|bpb)|val_bpb)/i,
    type: "evaluating",
    extract: () => "Evaluating results",
  },
  {
    pattern: /(?:training|step\s+(\d+)|epoch\s+(\d+)|loss[:\s]\s*([\d.]+))/i,
    type: "experimenting",
    extract: (m) => {
      if (m[1]) return `Training step ${m[1]}`;
      if (m[2]) return `Training epoch ${m[2]}`;
      if (m[3]) return `Training — loss: ${m[3]}`;
      return "Training";
    },
  },
  {
    pattern: /(?:committing|committed|git commit|git add)/i,
    type: "committing",
    extract: () => "Committing changes",
  },
  {
    pattern: /(?:error|exception|traceback|fatal|failed)/i,
    type: "error",
    extract: (_m, line) => line.trim().slice(0, 80),
  },
  {
    pattern: /(?:thinking|planning|analyzing|considering)/i,
    type: "thinking",
    extract: () => "Thinking...",
  },
];

function parseEvents(rawOutput: string): ActivityEvent[] {
  const lines = rawOutput.split("\n").filter((l) => l.trim());
  const events: ActivityEvent[] = [];
  const now = Date.now();

  const lineCount = lines.length;
  for (let i = 0; i < lineCount; i++) {
    const line = lines[i];
    for (const rule of PATTERNS) {
      const match = line.match(rule.pattern);
      if (match) {
        events.push({
          ts: now - (lineCount - i) * 1000,
          type: rule.type,
          message: rule.extract(match, line),
        });
        break;
      }
    }
  }

  return events;
}

function deriveStatus(events: ActivityEvent[]): ActivityStatus {
  if (events.length === 0) return "idle";
  const last = events[events.length - 1];
  switch (last.type) {
    case "experimenting": return "experimenting";
    case "modifying": return "modifying";
    case "evaluating": return "evaluating";
    case "thinking": return "thinking";
    case "reading": return "thinking";
    case "committing": return "modifying";
    case "error": return "error";
    case "idle": return "idle";
    default: return "idle";
  }
}

function buildSummary(
  status: ActivityStatus,
  events: ActivityEvent[],
  modifiedFiles: string[]
): string {
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  if (!lastEvent) return "Waiting for activity...";

  const elapsed = Date.now() - lastEvent.ts;
  const ago = elapsed < 60000
    ? `${Math.round(elapsed / 1000)}s ago`
    : `${Math.round(elapsed / 60000)}m ago`;

  const parts: string[] = [lastEvent.message];

  if (status === "modifying" && modifiedFiles.length > 0) {
    const fileList = modifiedFiles.slice(0, 3).join(", ");
    const extra = modifiedFiles.length > 3 ? ` +${modifiedFiles.length - 3}` : "";
    parts[0] = `Modifying ${fileList}${extra}`;
  }

  parts.push(ago);
  return parts.join(" — ");
}

// --- Process-based activity detection (fallback for --print mode) ---

const PROCESS_ACTIVITY: Record<string, { type: ActivityType; message: string }> = {
  python3: { type: "evaluating", message: "Running evaluation" },
  python: { type: "evaluating", message: "Running evaluation" },
  uv: { type: "evaluating", message: "Running evaluation (uv)" },
  claude: { type: "thinking", message: "Agent is working" },
  git: { type: "committing", message: "Git operation" },
  node: { type: "experimenting", message: "Running experiment" },
};

async function detectProcessActivity(tmuxSession: string): Promise<ActivityEvent | null> {
  try {
    const { stdout: panePid } = await execFileAsync("tmux", [
      "list-panes", "-t", tmuxSession, "-F", "#{pane_pid}",
    ], { timeout: 5000 });

    const rootPid = panePid.trim().split("\n")[0];
    if (!rootPid) return null;

    // Walk the process tree to find meaningful child processes
    const { stdout: psOutput } = await execFileAsync("bash", [
      "-c",
      `cat /proc/*/status 2>/dev/null | awk '/^Name:/{name=$2} /^PPid:/{ppid=$2} /^Pid:/{pid=$2; if(pid && name) print pid, ppid, name; name=""; pid=""; ppid=""}'`,
    ], { timeout: 5000 });

    // Build parent→children map and find descendants of the pane PID
    const processes: Array<{ pid: string; ppid: string; name: string }> = [];
    for (const line of psOutput.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        processes.push({ pid: parts[0], ppid: parts[1], name: parts[2] });
      }
    }

    // Find all descendants of rootPid
    const descendants = new Set<string>();
    const queue = [rootPid];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const p of processes) {
        if (p.ppid === current && !descendants.has(p.pid)) {
          descendants.add(p.pid);
          queue.push(p.pid);
        }
      }
    }

    // Find the deepest meaningful process
    let bestMatch: { type: ActivityType; message: string } | null = null;
    for (const p of processes) {
      if (descendants.has(p.pid) && PROCESS_ACTIVITY[p.name]) {
        bestMatch = PROCESS_ACTIVITY[p.name];
      }
    }

    if (bestMatch) {
      return { ts: Date.now(), type: bestMatch.type, message: bestMatch.message };
    }

    // If claude is a descendant but no deeper match, it's thinking
    for (const p of processes) {
      if (descendants.has(p.pid) && p.name === "claude") {
        return { ts: Date.now(), type: "thinking", message: "Agent is thinking..." };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// --- Main export ---

export async function captureActivity(
  tmuxSession: string,
  worktreePath: string | null
): Promise<ActivitySnapshot> {
  const [rawOutput, modifiedFiles] = await Promise.all([
    captureTmuxPane(tmuxSession),
    worktreePath ? getModifiedFiles(worktreePath) : Promise.resolve([]),
  ]);

  let events = parseEvents(rawOutput);

  // Fallback: if no events from tmux output (e.g. --print mode),
  // detect activity from the process tree
  if (events.length === 0) {
    const processEvent = await detectProcessActivity(tmuxSession);
    if (processEvent) {
      events = [processEvent];
    }
  }

  const status = deriveStatus(events);
  const summary = buildSummary(status, events, modifiedFiles);
  const lastActivityAt = events.length > 0
    ? events[events.length - 1].ts
    : 0;

  return {
    status,
    summary,
    events: events.slice(-20),
    rawOutput,
    modifiedFiles,
    lastActivityAt,
  };
}
