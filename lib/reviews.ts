import type { Database } from "./database";
import { appendAudit } from "./uploads";

export class ReviewStateError extends Error {}

export function decisionAllowed(requestedBy: string, actorId: string): boolean {
  return requestedBy !== actorId;
}

export function annotationAllowed(
  timecodeMs: number,
  durationMs: number,
): boolean {
  return timecodeMs >= 0 && timecodeMs <= durationMs;
}

export async function requestReview(
  sql: Database,
  assetVersionId: string,
  actorId: string,
) {
  const [rendition] = await sql`
    select id
    from transform_jobs
    where asset_version_id = ${assetVersionId}
      and state = 'completed'
    limit 1
  `;
  if (rendition === undefined) {
    throw new ReviewStateError("A completed rendition is required.");
  }
  const [review] = await sql`
    insert into reviews (asset_version_id, requested_by)
    values (${assetVersionId}, ${actorId})
    on conflict (asset_version_id)
    do update set asset_version_id = excluded.asset_version_id
    returning *
  `;
  await appendAudit(sql, "review.requested", "review", review.id, actorId, {
    assetVersionId,
  });
  return review;
}

export async function addAnnotation(
  sql: Database,
  reviewId: string,
  timecodeMs: number,
  body: string,
  actorId: string,
) {
  const [review] = await sql<
    Array<{ assetVersionId: string; durationMs: number | null; state: string }>
  >`
    select
      reviews.asset_version_id,
      reviews.state,
      transform_jobs.duration_ms
    from reviews
    join transform_jobs
      on transform_jobs.asset_version_id = reviews.asset_version_id
      and transform_jobs.state = 'completed'
    where reviews.id = ${reviewId}
  `;
  if (
    review === undefined ||
    review.state !== "pending" ||
    review.durationMs === null ||
    !annotationAllowed(timecodeMs, review.durationMs)
  ) {
    throw new ReviewStateError("Annotation is outside the pending review.");
  }
  const [annotation] = await sql`
    insert into annotations (review_id, timecode_ms, body, created_by)
    values (${reviewId}, ${timecodeMs}, ${body}, ${actorId})
    returning *
  `;
  return annotation;
}

export async function decideReview(
  sql: Database,
  reviewId: string,
  expectedRevision: number,
  decision: "approved" | "rejected",
  note: string,
  actorId: string,
) {
  return sql.begin(async (transaction) => {
    const [review] = await transaction<
      Array<{
        id: string;
        requestedBy: string;
        revision: number;
        state: string;
      }>
    >`
      select id, requested_by, revision, state
      from reviews
      where id = ${reviewId}
      for update
    `;
    if (
      review === undefined ||
      review.state !== "pending" ||
      review.revision !== expectedRevision ||
      !decisionAllowed(review.requestedBy, actorId)
    ) {
      throw new ReviewStateError(
        "Review is stale, completed, or violates separation of duties.",
      );
    }
    const [updated] = await transaction`
      update reviews
      set
        state = ${decision},
        revision = revision + 1,
        decided_by = ${actorId},
        decision_note = ${note},
        decided_at = now()
      where id = ${reviewId}
      returning *
    `;
    await appendAudit(
      transaction,
      `review.${decision}`,
      "review",
      reviewId,
      actorId,
      { previousRevision: expectedRevision },
    );
    return updated;
  });
}
