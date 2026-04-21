import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

function experimentsToCsv(
  experiments: Array<{
    run_number: number;
    val_bpb: number;
    delta: number | null;
    committed: number;
    change_summary: string | null;
    duration_s: number | null;
    peak_vram_mb: number | null;
    git_hash: string | null;
    created_at: number;
  }>
): string {
  const header = "run_number,metric_value,delta,status,change_summary,duration_s,peak_vram_mb,git_hash,created_at";
  const rows = experiments.map((e) => {
    const status = e.committed ? "kept" : "discarded";
    const summary = (e.change_summary ?? "").replace(/"/g, '""');
    const ts = new Date(e.created_at).toISOString();
    return `${e.run_number},${e.val_bpb},${e.delta ?? ""},${status},"${summary}",${e.duration_s ?? ""},${e.peak_vram_mb ?? ""},${e.git_hash ?? ""},${ts}`;
  });
  return [header, ...rows].join("\n");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse | Response> {
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "json";

  const session = db.getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const experiments = db.getExperiments(id, 0, 10000);
  const events = db.listSessionEvents({ session_id: id, limit: 10000 });

  if (format === "csv") {
    const csv = experimentsToCsv(experiments);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${session.tag}-experiments.csv"`,
      },
    });
  }

  if (format === "code") {
    // Tar the worktree or code directory and return as downloadable archive
    const codePath = session.worktree_path;
    if (!codePath) {
      return NextResponse.json(
        { error: "No worktree path associated with this session" },
        { status: 404 }
      );
    }

    try {
      const { stdout } = await execFileAsync(
        "tar",
        [
          "-czf", "-",
          "--exclude=.git",
          "--exclude=__pycache__",
          "--exclude=node_modules",
          "--exclude=.venv",
          "--exclude=uv.lock",
          "-C", codePath,
          ".",
        ],
        { encoding: "buffer", maxBuffer: 100 * 1024 * 1024 }
      );
      return new Response(stdout, {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${session.tag}-code.tar.gz"`,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create archive";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Default: full JSON report
  const report = {
    session: {
      tag: session.tag,
      status: session.status,
      agent_type: session.agent_type,
      strategy: session.strategy,
      metric_name: session.metric_name,
      metric_direction: session.metric_direction,
      best_value: session.best_val_bpb,
      experiment_count: session.experiment_count,
      restart_count: session.restart_count,
      started_at: session.started_at ? new Date(session.started_at).toISOString() : null,
      finished_at: session.finished_at ? new Date(session.finished_at).toISOString() : null,
      worktree_path: session.worktree_path,
    },
    experiments: experiments.map((e) => ({
      run_number: e.run_number,
      metric_value: e.val_bpb,
      delta: e.delta,
      status: e.committed ? "kept" : "discarded",
      change_summary: e.change_summary,
      duration_s: e.duration_s,
      peak_vram_mb: e.peak_vram_mb,
      git_hash: e.git_hash,
      created_at: new Date(e.created_at).toISOString(),
    })),
    events: events.map((e) => ({
      type: e.type,
      message: e.message,
      created_at: new Date(e.created_at).toISOString(),
    })),
  };

  const json = JSON.stringify(report, null, 2);
  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${session.tag}-report.json"`,
    },
  });
}
