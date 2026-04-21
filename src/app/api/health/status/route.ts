import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import { isSessionAlive } from "@/lib/process-manager";

export const dynamic = "force-dynamic";

interface HealthStatus {
  id: string;
  tag: string;
  status: string;
  tmux_alive: boolean;
  healthy: boolean;
  gpu_index: number | null;
  restart_count: number;
  last_restart_at: number | null;
  experiment_count: number;
  best_val_bpb: number | null;
  metric_name: string;
  metric_direction: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const allSessions = db.listSessions();
    const activeSessions = allSessions.filter(
      (s) => s.status === "running" || s.status === "paused"
    );

    const sessionHealthChecks: Promise<HealthStatus>[] = activeSessions.map(
      async (session) => {
        const tmuxAlive = session.tmux_session
          ? await isSessionAlive(session.tmux_session)
          : false;

        const healthy =
          session.status === "paused" || (session.status === "running" && tmuxAlive);

        return {
          id: session.id,
          tag: session.tag,
          status: session.status,
          tmux_alive: tmuxAlive,
          healthy,
          gpu_index: session.gpu_index,
          restart_count: session.restart_count,
          last_restart_at: session.last_restart_at,
          experiment_count: session.experiment_count,
          best_val_bpb: session.best_val_bpb,
          metric_name: session.metric_name,
          metric_direction: session.metric_direction,
        };
      }
    );

    const sessions = await Promise.all(sessionHealthChecks);
    const healthyCount = sessions.filter((s) => s.healthy).length;
    const unhealthyCount = sessions.length - healthyCount;
    const totalRestarts = sessions.reduce((sum, s) => sum + s.restart_count, 0);

    return NextResponse.json({
      sessions,
      summary: {
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        total_restarts: totalRestarts,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
