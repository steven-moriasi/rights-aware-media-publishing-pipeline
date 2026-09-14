import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import { reconcilePublication } from "@/lib/publications";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";

interface ReconcileBody {
  foundDelivered?: boolean;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["operator"]);
    const { publicationId } = await params;
    const body = (await request.json()) as ReconcileBody;
    if (body.foundDelivered === undefined) {
      return NextResponse.json(
        { error: "A reconciliation finding is required." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await reconcilePublication(
        getDatabase(),
        publicationId,
        body.foundDelivered,
        context.actorId,
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Reconciliation failed.",
      },
      { status: 409 },
    );
  }
}
