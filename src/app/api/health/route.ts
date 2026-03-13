import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import { getGpuStatus } from "@/lib/gpu";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const sessions = db.getSessionCounts();
  const gpus = await getGpuStatus();

  return NextResponse.json({
    status: "ok",
    sessions,
    gpus: gpus.length,
    uptime_s: Math.floor(process.uptime()),
  });
}
