import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  ActorContextError,
  actorContext,
  requireRole,
} from "@/lib/request-context";
import {
  UploadStateError,
  createUpload,
  listUploads,
} from "@/lib/uploads";

interface CreateUploadBody {
  expectedSha256?: string;
  expectedSize?: number;
  fileName?: string;
  mediaType?: string;
  title?: string;
}

export async function GET(request: Request) {
  try {
    const context = actorContext(request);
    requireRole(context, ["producer", "operator"]);
    return NextResponse.json({ uploads: await listUploads(getDatabase()) });
  } catch (error) {
    return uploadError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = actorContext(request);
    requireRole(context, ["producer"]);
    const body = (await request.json()) as CreateUploadBody;
    if (
      body.title === undefined ||
      body.fileName === undefined ||
      body.mediaType === undefined ||
      body.expectedSize === undefined ||
      body.expectedSha256 === undefined
    ) {
      return NextResponse.json(
        { error: "Upload metadata is incomplete." },
        { status: 400 },
      );
    }
    const upload = await createUpload(
      getDatabase(),
      {
        expectedSha256: body.expectedSha256,
        expectedSize: body.expectedSize,
        fileName: body.fileName,
        mediaType: body.mediaType,
        title: body.title,
      },
      context.actorId,
    );
    return NextResponse.json({ upload }, { status: 201 });
  } catch (error) {
    return uploadError(error);
  }
}

export function uploadError(error: unknown) {
  if (error instanceof ActorContextError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof UploadStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error("upload request failed", error);
  return NextResponse.json(
    { error: "Upload operation failed." },
    { status: 500 },
  );
}
