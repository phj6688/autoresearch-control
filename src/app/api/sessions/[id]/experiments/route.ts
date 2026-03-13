import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const session = db.getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const offset = parseInt(
    request.nextUrl.searchParams.get("offset") ?? "0",
    10
  );
  const limit = parseInt(
    request.nextUrl.searchParams.get("limit") ?? "100",
    10
  );

  const experiments = db.getExperiments(
    id,
    isNaN(offset) ? 0 : offset,
    isNaN(limit) ? 100 : limit
  );
  const total = db.countExperiments(id);

  return NextResponse.json({ experiments, total });
}
