import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";
import { writeUploadPart } from "@/lib/uploads";
import { uploadError } from "@/app/api/uploads/route";

export async function PUT(
  request: Request,
  {
    params,
  }: { params: Promise<{ partNumber: string; uploadId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["producer"]);
    const { partNumber, uploadId } = await params;
    const bytes = Buffer.from(await request.arrayBuffer());
    const part = await writeUploadPart(
      getDatabase(),
      uploadId,
      Number(partNumber),
      bytes,
      context.actorId,
    );
    return NextResponse.json({ part });
  } catch (error) {
    return uploadError(error);
  }
}
