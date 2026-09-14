import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";
import {
  ReviewStateError,
  decideReview,
} from "@/lib/reviews";

interface DecisionBody {
  decision?: "approved" | "rejected";
  expectedRevision?: number;
  note?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["reviewer"]);
    const { reviewId } = await params;
    const body = (await request.json()) as DecisionBody;
    if (
      body.decision === undefined ||
      body.expectedRevision === undefined ||
      body.note === undefined
    ) {
      return NextResponse.json(
        { error: "Decision, revision, and note are required." },
        { status: 400 },
      );
    }
    const review = await decideReview(
      getDatabase(),
      reviewId,
      body.expectedRevision,
      body.decision,
      body.note,
      context.actorId,
    );
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Decision failed." },
      { status: error instanceof ReviewStateError ? 409 : 403 },
    );
  }
}
