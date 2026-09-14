import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";
import {
  ReviewStateError,
  addAnnotation,
} from "@/lib/reviews";

interface AnnotationBody {
  body?: string;
  timecodeMs?: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["reviewer"]);
    const { reviewId } = await params;
    const body = (await request.json()) as AnnotationBody;
    if (
      body.body === undefined ||
      body.timecodeMs === undefined ||
      body.body.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Annotation body and timecode are required." },
        { status: 400 },
      );
    }
    const annotation = await addAnnotation(
      getDatabase(),
      reviewId,
      body.timecodeMs,
      body.body,
      context.actorId,
    );
    return NextResponse.json({ annotation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Annotation failed." },
      { status: error instanceof ReviewStateError ? 409 : 403 },
    );
  }
}
