import { createHash } from "node:crypto";

import type { Database } from "./database";
import { appendAudit } from "./uploads";

export const reviewSpecId = "review-v1";
export const reviewSpecVersion = 1;

export function transformIdentity(
  sourceSha256: string,
  specId = reviewSpecId,
  specVersion = reviewSpecVersion,
): string {
  return createHash("sha256")
    .update(`${sourceSha256}:${specId}:${specVersion}`)
    .digest("hex");
}

export function retryState(attempts: number): "queued" | "quarantined" {
  return attempts >= 3 ? "quarantined" : "queued";
}

export async function queueTransform(
  sql: Database,
  assetVersionId: string,
  actorId: string,
) {
  const [version] = await sql<
    Array<{ id: string; sourceSha256: string; status: string }>
  >`
    select id, source_sha256, status
    from asset_versions
    where id = ${assetVersionId}
  `;
  if (version === undefined || version.status !== "available") {
    throw new Error("An available asset version is required.");
  }
  const identity = transformIdentity(version.sourceSha256);
  const [job] = await sql`
    insert into transform_jobs (
      asset_version_id,
      spec_id,
      transform_identity
    )
    values (${assetVersionId}, ${reviewSpecId}, ${identity})
    on conflict (asset_version_id, transform_identity)
    do update set transform_identity = excluded.transform_identity
    returning *
  `;
  await appendAudit(
    sql,
    "transform.queued",
    "transform-job",
    job.id,
    actorId,
    { transformIdentity: identity },
  );
  return job;
}

export async function listTransformJobs(sql: Database) {
  return sql`
    select
      transform_jobs.*,
      assets.title,
      asset_versions.source_sha256
    from transform_jobs
    join asset_versions on asset_versions.id = transform_jobs.asset_version_id
    join assets on assets.id = asset_versions.asset_id
    order by transform_jobs.created_at desc
    limit 50
  `;
}
