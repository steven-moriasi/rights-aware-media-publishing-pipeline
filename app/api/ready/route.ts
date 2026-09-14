import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import { ensureBucket } from "@/lib/object-storage";

export async function GET() {
  try {
    const [database] = await Promise.all([
      getDatabase()<Array<{ ready: number }>>`select 1 as ready`,
      ensureBucket(),
    ]);
    const ready = database[0]?.ready === 1;
    return NextResponse.json(
      {
        database: ready,
        objectStorage: true,
        status: ready ? "ready" : "degraded",
      },
      { status: ready ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      {
        database: false,
        objectStorage: false,
        status: "degraded",
      },
      { status: 503 },
    );
  }
}
