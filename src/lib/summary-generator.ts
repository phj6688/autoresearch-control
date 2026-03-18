import type { Session } from "./types";

/**
 * Produces a human-readable heuristic summary from session state
 * and the last output snapshot. Pure function — no side effects.
 */
export function generateHeuristicSummary(
  session: Session,
  lastSnapshot: string | null
): string {
  const parts: string[] = [];

  // Duration
  if (session.started_at) {
    const durationMs = (session.finished_at ?? Date.now()) - session.started_at;
    const hours = Math.floor(durationMs / 3_600_000);
    const minutes = Math.floor((durationMs % 3_600_000) / 60_000);
    if (hours > 0) {
      parts.push(`Duration: ${hours}h ${minutes}m`);
    } else {
      parts.push(`Duration: ${minutes}m`);
    }
  }

  // Experiment count
  if (session.experiment_count > 0) {
    parts.push(`Experiments: ${session.experiment_count}`);
  }

  // Best metric
  if (session.best_val_bpb !== null) {
    parts.push(`Best ${session.metric_name}: ${session.best_val_bpb.toFixed(4)}`);
  }

  // Last line of output
  if (lastSnapshot) {
    const lines = lastSnapshot.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim().slice(0, 120);
      parts.push(`Last output: ${lastLine}`);
    }
  }

  return parts.length > 0 ? parts.join(" | ") : "No activity recorded";
}
