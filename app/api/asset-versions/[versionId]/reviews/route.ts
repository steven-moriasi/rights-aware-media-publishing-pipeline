import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";
import {
  ReviewStateError,
  requestReview,
} from "@/lib/reviews";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["producer"]);
    const { versionId } = await params;
    const review = await requestReview(
      getDatabase(),
      versionId,
      context.actorId,
    );
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Review request failed.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof ReviewStateError ? 409 : 403 },
    );
  }
}
