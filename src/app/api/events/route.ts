import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get("session_id") ?? undefined;
  const type = searchParams.get("type") ?? undefined;

  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const limit = limitParam !== null ? parseInt(limitParam, 10) : 100;
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : 0;

  if (isNaN(limit) || limit < 0) {
    return NextResponse.json(
      { error: "Invalid limit parameter. Must be a non-negative integer." },
      { status: 400 }
    );
  }

  if (isNaN(offset) || offset < 0) {
    return NextResponse.json(
      { error: "Invalid offset parameter. Must be a non-negative integer." },
      { status: 400 }
    );
  }

  try {
    const filters = { session_id: sessionId, type, limit, offset };
    const events = db.listSessionEvents(filters);
    const total = db.countSessionEvents({ session_id: sessionId, type });

    return NextResponse.json({ events, total, limit, offset });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
