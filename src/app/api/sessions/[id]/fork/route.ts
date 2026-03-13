import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { forkSession, SessionError } from "@/lib/session-lifecycle";

export const dynamic = "force-dynamic";

const TAG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export async function POST(
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

  const tag = body.tag;
  if (typeof tag !== "string" || !TAG_REGEX.test(tag)) {
    return NextResponse.json(
      { error: "Invalid tag. Must be lowercase alphanumeric with hyphens, minimum 2 chars." },
      { status: 400 }
    );
  }

  const existing = db.getSessionByTag(tag);
  if (existing) {
    return NextResponse.json(
      { error: `Tag "${tag}" already exists` },
      { status: 409 }
    );
  }

  try {
    const session = await forkSession(id, {
      tag,
      strategy: typeof body.strategy === "string" ? body.strategy : undefined,
      gpu_index: typeof body.gpu === "number" ? body.gpu : undefined,
    });
    return NextResponse.json(session, { status: 201 });
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
