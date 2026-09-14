import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["producer", "operator"]);
    const { jobId } = await params;
    const [job] = await getDatabase()`
      select *
      from transform_jobs
      where id = ${jobId}
    `;
    return job === undefined
      ? NextResponse.json({ error: "Job not found." }, { status: 404 })
      : NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job lookup failed." },
      { status: 403 },
    );
  }
}
