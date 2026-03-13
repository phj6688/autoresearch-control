import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import {
  createSession,
  SessionError,
} from "@/lib/session-lifecycle";
import type { AgentType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TAG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const VALID_AGENTS: ReadonlySet<string> = new Set([
  "claude-code",
  "codex",
  "aider",
  "gemini-cli",
]);

export function GET(): NextResponse {
  const sessions = db.listSessions();
  return NextResponse.json(sessions);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tag = body.tag;
  const agentType = body.agentType ?? body.agent_type;
  const strategy = body.strategy;

  if (typeof tag !== "string" || !TAG_REGEX.test(tag)) {
    return NextResponse.json(
      {
        error:
          "Invalid tag. Must be lowercase alphanumeric with hyphens, no leading/trailing hyphens, minimum 2 chars.",
      },
      { status: 400 }
    );
  }

  if (typeof agentType !== "string" || !VALID_AGENTS.has(agentType)) {
    return NextResponse.json(
      { error: `Invalid agentType. Must be one of: ${[...VALID_AGENTS].join(", ")}` },
      { status: 400 }
    );
  }

  if (typeof strategy !== "string" || strategy.trim().length === 0) {
    return NextResponse.json(
      { error: "Strategy is required and must be non-empty" },
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
    const session = await createSession({
      tag,
      agent_type: agentType as AgentType,
      strategy,
      gpu_index:
        typeof body.gpu === "number"
          ? body.gpu
          : typeof body.gpu_index === "number"
            ? body.gpu_index
            : undefined,
      seed_from:
        typeof body.seedFrom === "string"
          ? body.seedFrom
          : typeof body.seed_from === "string"
            ? body.seed_from
            : undefined,
      program_md: typeof body.programMd === "string" ? body.programMd : undefined,
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
