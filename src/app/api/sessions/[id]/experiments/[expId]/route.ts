import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; expId: string }> }
): Promise<NextResponse> {
  const { id, expId } = await params;
  const experimentId = parseInt(expId, 10);

  if (isNaN(experimentId)) {
    return NextResponse.json(
      { error: "Invalid experiment ID" },
      { status: 400 }
    );
  }

  const session = db.getSession(id);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("annotation" in body)
  ) {
    return NextResponse.json(
      { error: "Missing annotation field" },
      { status: 400 }
    );
  }

  const { annotation } = body as { annotation: unknown };

  if (typeof annotation !== "string" && annotation !== null) {
    return NextResponse.json(
      { error: "Annotation must be a string or null" },
      { status: 400 }
    );
  }

  if (typeof annotation === "string" && annotation.length > 200) {
    return NextResponse.json(
      { error: "Annotation must be at most 200 characters" },
      { status: 400 }
    );
  }

  const updated = db.updateExperimentAnnotation(
    experimentId,
    id,
    typeof annotation === "string" ? annotation : null
  );

  if (!updated) {
    return NextResponse.json(
      { error: "Experiment not found or does not belong to this session" },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}
