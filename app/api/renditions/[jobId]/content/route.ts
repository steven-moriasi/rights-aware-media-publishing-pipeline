import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import { getObject } from "@/lib/object-storage";
import {
  ActorContextError,
  actorContext,
  requireRole,
} from "@/lib/request-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, [
      "producer",
      "reviewer",
      "rights-manager",
      "publisher",
      "operator",
    ]);
    const { jobId } = await params;
    const [job] = await getDatabase()<
      Array<{ outputMediaType: string; outputObjectKey: string }>
    >`
      select output_media_type, output_object_key
      from transform_jobs
      where id = ${jobId}
        and state = 'completed'
    `;
    if (job === undefined) {
      return NextResponse.json(
        { error: "Rendition was not found." },
        { status: 404 },
      );
    }
    const content = await getObject(job.outputObjectKey);
    return new Response(new Uint8Array(content), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": job.outputMediaType,
      },
    });
  } catch (error) {
    if (error instanceof ActorContextError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("rendition access failed", error);
    return NextResponse.json(
      { error: "Rendition access failed." },
      { status: 500 },
    );
  }
}
