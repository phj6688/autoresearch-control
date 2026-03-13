import { NextResponse } from "next/server";
import { getGpuStatusEnriched } from "@/lib/session-lifecycle";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const gpus = await getGpuStatusEnriched();
  return NextResponse.json(gpus);
}
