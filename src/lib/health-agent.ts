/**
 * Background health-check loop that monitors running/paused sessions.
 * Detects orphaned tmux sessions, auto-restarts with cooldown, and
 * escalates to openclaw when restart budget is exhausted.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as db from "./db";
import * as pm from "./process-manager";
import { broker } from "./sse-broker";
import { generateHeuristicSummary } from "./summary-generator";
import { alertCriticalFailure, alertEscalationResult } from "./openclaw-alert";
import type { SessionEvent, SessionEventType } from "./types";

const execFileAsync = promisify(execFile);

const HEALTH_INTERVAL_MS = 30_000;
const RESTART_COOLDOWN_MS = 5 * 60_000;
const SNAPSHOT_LINES = 200;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let started = false;

function logEvent(
  sessionId: string,
  type: SessionEventType,
  message: string,
  details?: string | null
): SessionEvent {
  const event = db.insertSessionEvent({
    session_id: sessionId,
    type,
    message,
    details: details ?? null,
  });
  broker.broadcast({ type: "health-event", event });
  return event;
}

async function captureTmuxSnapshot(tmuxSession: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane", "-p", "-t", tmuxSession, "-S", `-${SNAPSHOT_LINES}`,
    ], { timeout: 5000 });
    return stdout;
  } catch {
    return "";
  }
}

async function runHealthCheck(): Promise<void> {
  const sessions = db.listSessions();
  const active = sessions.filter(
    (s) => s.status === "running" || s.status === "paused"
  );

  for (const session of active) {
    try {
      await checkSession(session.id, session.tag, session.tmux_session, session.status);
    } catch {
      /* never let one session crash the whole loop */
    }
  }
}

async function checkSession(
  sessionId: string,
  sessionTag: string,
  tmuxSession: string | null,
  status: string
): Promise<void> {
  if (!tmuxSession) return;

  const alive = await pm.isSessionAlive(tmuxSession);

  if (alive) {
    // Capture snapshot and store it
    const snapshot = await captureTmuxSnapshot(tmuxSession);
    if (snapshot) {
      const session = db.getSession(sessionId);
      if (session) {
        const summary = generateHeuristicSummary(session, snapshot);
        db.updateSession(sessionId, {
          last_output_snapshot: snapshot,
          last_summary: summary,
        });
      }
    }
    return;
  }

  // Session is dead — only act on "running" sessions (paused may intentionally have no tmux)
  if (status !== "running") return;

  // Orphan detected
  logEvent(sessionId, "orphan_detected", `Tmux session "${tmuxSession}" is dead`);

  // Generate summary from whatever we have
  const session = db.getSession(sessionId);
  if (!session) return;

  const summary = generateHeuristicSummary(session, session.last_output_snapshot);

  // Check restart cooldown
  const now = Date.now();
  if (session.last_restart_at && now - session.last_restart_at < RESTART_COOLDOWN_MS) {
    // Too soon — escalate
    logEvent(
      sessionId,
      "escalation_triggered",
      `Restart cooldown active — last restart was ${Math.round((now - session.last_restart_at) / 1000)}s ago`
    );

    db.updateSession(sessionId, {
      status: "failed",
      finished_at: now,
      last_summary: summary,
    });

    broker.broadcast({
      type: "session-status",
      sessionId,
      status: "failed",
    });

    await alertCriticalFailure(
      sessionTag,
      `Repeated failure within cooldown. Summary: ${summary}`
    );
    await alertEscalationResult(sessionTag, "Marked as failed — manual intervention required");
    return;
  }

  // Attempt auto-restart
  db.updateSession(sessionId, {
    status: "failed",
    last_summary: summary,
  });

  broker.broadcast({
    type: "session-status",
    sessionId,
    status: "failed",
  });

  try {
    const { restartSession } = await import("./session-lifecycle");
    await restartSession(sessionId);

    const newRestartCount = (session.restart_count ?? 0) + 1;
    db.updateSession(sessionId, {
      restart_count: newRestartCount,
      last_restart_at: Date.now(),
    });

    logEvent(
      sessionId,
      "auto_restarted",
      `Auto-restarted (attempt #${newRestartCount})`
    );
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    logEvent(sessionId, "restart_failed", `Auto-restart failed: ${reason}`);
    await alertCriticalFailure(sessionTag, `Auto-restart failed: ${reason}. Summary: ${summary}`);
  }
}

export function startHealthAgent(): void {
  if (started) return;
  started = true;

  // Run immediately to catch orphans from container restart
  void runHealthCheck();

  intervalHandle = setInterval(() => {
    void runHealthCheck();
  }, HEALTH_INTERVAL_MS);
}

export function stopHealthAgent(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  started = false;
}
