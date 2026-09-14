import { NextResponse } from "next/server";

import { uploadError } from "@/app/api/uploads/route";
import { getDatabase } from "@/lib/database";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";
import { completeUpload } from "@/lib/uploads";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["producer"]);
    const { uploadId } = await params;
    const result = await completeUpload(
      getDatabase(),
      uploadId,
      context.actorId,
    );
    return NextResponse.json(result, {
      status: result.inspection?.accepted === false ? 422 : 200,
    });
  } catch (error) {
    return uploadError(error);
  }
}
