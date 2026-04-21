import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import {
  startSession,
  pauseSession,
  resumeSession,
  restartSession,
  killSession,
  deleteSessionById,
  SessionError,
} from "@/lib/session-lifecycle";

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

  const experiments = db.getExperiments(id);

  return NextResponse.json({ ...session, experiments });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "start" && action !== "pause" && action !== "resume" && action !== "restart" && action !== "kill") {
    return NextResponse.json(
      { error: 'Invalid action. Must be "start", "pause", "resume", "restart", or "kill".' },
      { status: 400 }
    );
  }

  try {
    let session;
    switch (action) {
      case "start":
        session = await startSession(id);
        break;
      case "pause":
        session = await pauseSession(id);
        break;
      case "resume":
        session = await resumeSession(id);
        break;
      case "restart":
        session = await restartSession(id);
        break;
      case "kill":
        session = await killSession(id);
        break;
    }
    return NextResponse.json(session);
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const deleteWorktree =
    request.nextUrl.searchParams.get("deleteWorktree") === "true";

  try {
    await deleteSessionById(id, deleteWorktree);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
