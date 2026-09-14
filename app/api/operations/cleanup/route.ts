import { NextResponse } from "next/server";

import { cleanupExpiredUploads } from "@/lib/cleanup";
import { getDatabase } from "@/lib/database";
import { operationsAuthorized } from "@/lib/operations-auth";

export async function POST(request: Request) {
  if (!operationsAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json({
    cleanup: await cleanupExpiredUploads(getDatabase(), "operations-cleanup"),
  });
}
