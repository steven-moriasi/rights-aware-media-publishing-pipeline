import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  PublicationStateError,
  revokePublication,
} from "@/lib/publications";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";

interface RevokeBody {
  reason?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["rights-manager"]);
    const { publicationId } = await params;
    const body = (await request.json()) as RevokeBody;
    if (body.reason === undefined || body.reason.trim().length === 0) {
      return NextResponse.json(
        { error: "A revocation reason is required." },
        { status: 400 },
      );
    }
    const revocation = await revokePublication(
      getDatabase(),
      publicationId,
      body.reason,
      context.actorId,
    );
    return NextResponse.json({ revocation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Revocation failed." },
      { status: error instanceof PublicationStateError ? 409 : 403 },
    );
  }
}
