import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  ActorContextError,
  actorContext,
  requireRole,
} from "@/lib/request-context";
import { queueTransform } from "@/lib/transforms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["producer", "operator"]);
    const { versionId } = await params;
    const job = await queueTransform(
      getDatabase(),
      versionId,
      context.actorId,
    );
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    if (error instanceof ActorContextError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("transform queue failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Queue failed." },
      { status: 409 },
    );
  }
}
