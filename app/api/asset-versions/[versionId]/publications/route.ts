import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  createPublicationIntent,
  PublicationStateError,
} from "@/lib/publications";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";

interface PublicationBody {
  destination?: string;
  idempotencyKey?: string;
  renditionSpecId?: string;
  scheduledFor?: string;
  territory?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["publisher"]);
    const { versionId } = await params;
    const body = (await request.json()) as PublicationBody;
    if (
      body.destination === undefined ||
      body.idempotencyKey === undefined ||
      body.renditionSpecId === undefined ||
      body.scheduledFor === undefined ||
      body.territory === undefined
    ) {
      return NextResponse.json(
        { error: "Publication intent is incomplete." },
        { status: 400 },
      );
    }
    const intent = await createPublicationIntent(
      getDatabase(),
      {
        assetVersionId: versionId,
        destination: body.destination,
        idempotencyKey: body.idempotencyKey,
        renditionSpecId: body.renditionSpecId,
        scheduledFor: new Date(body.scheduledFor),
        territory: body.territory,
      },
      context.actorId,
    );
    return NextResponse.json({ intent }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Publication scheduling failed.",
      },
      { status: error instanceof PublicationStateError ? 409 : 403 },
    );
  }
}
