import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import { operationsAuthorized } from "@/lib/operations-auth";

export async function GET(request: Request) {
  if (!operationsAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const sql = getDatabase();
  const [queue] = await sql`
    select
      count(*) filter (where state = 'queued')::int as queued,
      count(*) filter (where state = 'leased')::int as leased,
      count(*) filter (where state = 'quarantined')::int as quarantined,
      coalesce(
        extract(epoch from now() - min(created_at))
          filter (where state = 'queued'),
        0
      )::int as oldest_queue_seconds
    from transform_jobs
  `;
  const [publication] = await sql`
    select
      count(*) filter (where state = 'unknown')::int as unknown,
      coalesce(
        extract(epoch from now() - min(updated_at))
          filter (where state = 'unknown'),
        0
      )::int as oldest_unknown_seconds,
      count(*) filter (where state = 'revoked')::int as revoked
    from publication_intents
  `;
  const [storage] = await sql`
    select
      coalesce(sum(size_bytes), 0)::bigint as source_bytes,
      count(*)::int as asset_versions
    from asset_versions
  `;
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    publication,
    queue,
    storage,
  });
}
