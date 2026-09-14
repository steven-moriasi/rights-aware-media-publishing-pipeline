import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  executePublication,
  PublicationStateError,
  type SandboxOutcome,
} from "@/lib/publications";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";

const outcomes: SandboxOutcome[] = ["delivered", "rejected", "unknown"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["publisher"]);
    const outcome = request.headers.get("x-sandbox-outcome") as SandboxOutcome;
    if (!outcomes.includes(outcome)) {
      return NextResponse.json(
        { error: "A deterministic sandbox outcome is required." },
        { status: 400 },
      );
    }
    const { publicationId } = await params;
    const result = await executePublication(
      getDatabase(),
      publicationId,
      outcome,
      context.actorId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Execution failed." },
      { status: error instanceof PublicationStateError ? 409 : 403 },
    );
  }
}
