import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    uptime_s: Math.floor(process.uptime()),
  });
}
