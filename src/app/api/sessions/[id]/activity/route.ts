import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { captureActivity } from "@/lib/activity-parser";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const session = db.getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!session.tmux_session) {
    return NextResponse.json(
      { error: "No live process attached" },
      { status: 404 }
    );
  }

  try {
    const snapshot = await captureActivity(
      session.tmux_session,
      session.worktree_path
    );
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to capture activity";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
