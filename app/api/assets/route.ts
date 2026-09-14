import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  ActorContextError,
  actorContext,
  requireRole,
} from "@/lib/request-context";
import { listAssets } from "@/lib/uploads";

export async function GET(request: Request) {
  try {
    const context = actorContext(request);
    requireRole(context, [
      "producer",
      "reviewer",
      "rights-manager",
      "publisher",
      "operator",
    ]);
    return NextResponse.json({ assets: await listAssets(getDatabase()) });
  } catch (error) {
    if (error instanceof ActorContextError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("asset listing failed", error);
    return NextResponse.json(
      { error: "Asset listing failed." },
      { status: 500 },
    );
  }
}
