import { NextResponse } from "next/server";
import * as chatDb from "@/lib/chat-db";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  try {
    const conversations = chatDb.listConversations();
    return NextResponse.json(conversations);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
