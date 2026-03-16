import * as db from "./db";
import * as git from "./git";
import * as pm from "./process-manager";
import { getGpuStatus, findFreeGpu } from "./gpu";
import { watchSession } from "./watcher";
import { broker } from "./sse-broker";
import { evaluateExperimentAlerts } from "./telegram";
import { isBetter } from "./metric-utils";
import type {
  Session,
  CreateSessionInput,
  ForkSessionInput,
  WatcherHandle,
  ParsedExperiment,
} from "./types";

const REPO_PATH = process.env.AUTORESEARCH_REPO_PATH ?? "";
const WORKTREE_DIR = process.env.AUTORESEARCH_WORKTREE_DIR ?? "";

const activeWatchers = new Map<string, WatcherHandle>();

function onNewExperiments(
  sessionId: string,
  experiments: ParsedExperiment[]
): void {
  const session = db.getSession(sessionId);
  if (!session) return;

  let bestBpb = session.best_val_bpb;
  let expCount = session.experiment_count;

  for (const exp of experiments) {
    const prevBest = bestBpb;
    const delta = prevBest !== null ? exp.val_bpb - prevBest : null;

    const inserted = db.insertExperiment({
      session_id: sessionId,
      run_number: exp.run_number,
      val_bpb: exp.val_bpb,
      peak_vram_mb: exp.peak_vram_mb,
      duration_s: null,
      committed: 0,
      change_summary: exp.description,
      git_hash: null,
      delta,
      log_tail: null,
    });

    if (bestBpb === null || isBetter(exp.val_bpb, bestBpb, session.metric_direction)) {
      bestBpb = exp.val_bpb;
    }
    expCount++;

    broker.broadcast({
      type: "experiment",
      sessionId,
      experiment: inserted,
    });
  }

  evaluateExperimentAlerts(session, experiments);

  db.updateSession(sessionId, {
    best_val_bpb: bestBpb,
    experiment_count: expCount,
  });
}

async function promoteToRunning(
  session: Session,
  gpuIndex: number
): Promise<Session> {
  let worktreePath: string | undefined;
  let tmuxName: string | undefined;

  try {
    worktreePath = await git.createWorktree(REPO_PATH, WORKTREE_DIR, session.tag);

    if (session.seed_from) {
      const sourceSession = db.getSession(session.seed_from);
      if (sourceSession?.worktree_path) {
        await git.seedTrainPy(sourceSession.worktree_path, worktreePath);
      }
    }

    tmuxName = await pm.spawnSession({
      tag: session.tag,
      worktreePath,
      gpuIndex,
      agentType: session.agent_type,
      programMd: session.program_md ?? session.strategy,
    });

    const handle = watchSession(session.id, worktreePath, onNewExperiments);
    activeWatchers.set(session.id, handle);

    const updated = db.updateSession(session.id, {
      status: "running",
      gpu_index: gpuIndex,
      worktree_path: worktreePath,
      tmux_session: tmuxName,
      started_at: Date.now(),
    });

    broker.broadcast({
      type: "session-status",
      sessionId: session.id,
      status: "running",
    });

    return updated ?? session;
  } catch (err) {
    if (tmuxName) {
      try {
        await pm.killSession(tmuxName);
      } catch {
        /* cleanup best effort */
      }
    }
    if (worktreePath) {
      try {
        await git.deleteWorktree(REPO_PATH, worktreePath);
      } catch {
        /* cleanup best effort */
      }
    }
    throw err;
  }
}

export async function createSession(
  input: CreateSessionInput
): Promise<Session> {
  const session = db.insertSession(input);

  try {
    const assignedGpus = db.getAssignedGpuIndexes();
    let gpuIndex: number | null = null;

    if (input.gpu_index !== undefined && input.gpu_index !== null) {
      if (!assignedGpus.includes(input.gpu_index)) {
        gpuIndex = input.gpu_index;
      }
    } else {
      gpuIndex = await findFreeGpu(assignedGpus);
    }

    if (gpuIndex !== null) {
      return await promoteToRunning(session, gpuIndex);
    }

    return session;
  } catch (err) {
    db.deleteSession(session.id);
    throw err;
  }
}

export async function pauseSession(id: string): Promise<Session> {
  const session = db.getSession(id);
  if (!session) throw new SessionError(404, "Session not found");
  if (session.status !== "running") {
    throw new SessionError(
      409,
      `Cannot pause session in ${session.status} state`
    );
  }

  if (session.tmux_session) {
    await pm.pauseSession(session.tmux_session);
  }

  const updated = db.updateSession(id, { status: "paused" });
  broker.broadcast({
    type: "session-status",
    sessionId: id,
    status: "paused",
  });

  return updated ?? session;
}

export async function resumeSession(id: string): Promise<Session> {
  const session = db.getSession(id);
  if (!session) throw new SessionError(404, "Session not found");
  if (session.status !== "paused") {
    throw new SessionError(
      409,
      `Cannot resume session in ${session.status} state`
    );
  }

  if (!session.tmux_session) {
    throw new SessionError(
      409,
      "No process to resume. Use restart to spawn a new agent."
    );
  }

  await pm.resumeSession(session.tmux_session);

  const updated = db.updateSession(id, { status: "running" });
  broker.broadcast({
    type: "session-status",
    sessionId: id,
    status: "running",
  });

  return updated ?? session;
}

export async function restartSession(id: string): Promise<Session> {
  const session = db.getSession(id);
  if (!session) throw new SessionError(404, "Session not found");
  if (session.status !== "paused" && session.status !== "killed" && session.status !== "failed") {
    throw new SessionError(
      409,
      `Cannot restart session in ${session.status} state`
    );
  }

  // Kill existing tmux if lingering
  if (session.tmux_session) {
    try {
      await pm.killSession(session.tmux_session);
    } catch {
      /* best effort cleanup */
    }
  }

  // Stop existing watcher if any
  const watcher = activeWatchers.get(id);
  if (watcher) {
    watcher.stop();
    activeWatchers.delete(id);
  }

  // GPU is optional — only allocate if session previously had one or one is available
  let gpuIndex: number | null = session.gpu_index;
  if (gpuIndex === null) {
    const assignedGpus = db.getAssignedGpuIndexes();
    gpuIndex = await findFreeGpu(assignedGpus);
    // null is fine — not all sessions need a GPU
  }

  // Create worktree if needed
  let worktreePath = session.worktree_path;
  if (!worktreePath) {
    worktreePath = await git.createWorktree(REPO_PATH, WORKTREE_DIR, session.tag);
  }

  // Spawn fresh agent
  const tmuxName = await pm.spawnSession({
    tag: session.tag,
    worktreePath,
    gpuIndex: gpuIndex ?? -1,
    agentType: session.agent_type,
    programMd: session.program_md ?? session.strategy,
  });

  // Start watcher
  const handle = watchSession(id, worktreePath, onNewExperiments);
  activeWatchers.set(id, handle);

  const updated = db.updateSession(id, {
    status: "running",
    gpu_index: gpuIndex,
    worktree_path: worktreePath,
    tmux_session: tmuxName,
    started_at: session.started_at ?? Date.now(),
    finished_at: null,
  });

  broker.broadcast({
    type: "session-status",
    sessionId: id,
    status: "running",
  });

  return updated ?? session;
}

export async function killSession(id: string): Promise<Session> {
  const session = db.getSession(id);
  if (!session) throw new SessionError(404, "Session not found");
  if (session.status !== "running" && session.status !== "paused") {
    throw new SessionError(
      409,
      `Cannot kill session in ${session.status} state`
    );
  }

  const watcher = activeWatchers.get(id);
  if (watcher) {
    watcher.stop();
    activeWatchers.delete(id);
  }

  if (session.tmux_session) {
    await pm.killSession(session.tmux_session);
  }

  const updated = db.updateSession(id, {
    status: "killed",
    gpu_index: null,
    finished_at: Date.now(),
  });

  broker.broadcast({
    type: "session-status",
    sessionId: id,
    status: "killed",
  });

  void autoPromoteQueued();

  return updated ?? session;
}

export async function deleteSessionById(
  id: string,
  deleteWorktree: boolean
): Promise<void> {
  const session = db.getSession(id);
  if (!session) throw new SessionError(404, "Session not found");

  const deletable: ReadonlyArray<string> = [
    "killed",
    "completed",
    "failed",
    "queued",
  ];
  if (!deletable.includes(session.status)) {
    throw new SessionError(
      409,
      `Cannot delete session in ${session.status} state. Kill it first.`
    );
  }

  const watcher = activeWatchers.get(id);
  if (watcher) {
    watcher.stop();
    activeWatchers.delete(id);
  }

  if (deleteWorktree && session.worktree_path) {
    try {
      await git.deleteWorktree(REPO_PATH, session.worktree_path);
    } catch {
      /* best effort */
    }
  }

  db.deleteSession(id);
}

export async function forkSession(
  sourceId: string,
  input: ForkSessionInput
): Promise<Session> {
  const source = db.getSession(sourceId);
  if (!source) throw new SessionError(404, "Source session not found");

  const experiments = db.getExperiments(sourceId);
  const committed = experiments.filter((e) => e.committed);
  if (committed.length === 0 && experiments.length === 0) {
    /* allow fork even with no committed experiments — use source worktree */
  }

  return createSession({
    tag: input.tag,
    agent_type: source.agent_type,
    strategy: input.strategy ?? source.strategy,
    gpu_index: input.gpu_index,
    seed_from: sourceId,
    program_md: source.program_md,
  });
}

async function autoPromoteQueued(): Promise<void> {
  const next = db.getNextQueuedSession();
  if (!next) return;

  const assignedGpus = db.getAssignedGpuIndexes();
  const freeGpu = await findFreeGpu(assignedGpus);
  if (freeGpu === null) return;

  try {
    await promoteToRunning(next, freeGpu);
  } catch {
    /* failed to promote — leave queued */
  }
}

export async function getGpuStatusEnriched(): Promise<
  Array<{
    index: number;
    name: string;
    memory_total_mb: number;
    memory_used_mb: number;
    utilization_pct: number;
    temperature_c: number;
    session_tag: string | null;
  }>
> {
  const gpus = await getGpuStatus();
  const sessions = db.listSessions();
  const gpuToSession = new Map<number, string>();

  for (const s of sessions) {
    if (s.status === "running" && s.gpu_index !== null) {
      gpuToSession.set(s.gpu_index, s.tag);
    }
  }

  return gpus.map((gpu) => ({
    ...gpu,
    session_tag: gpuToSession.get(gpu.index) ?? null,
  }));
}

export class SessionError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "SessionError";
  }
}
