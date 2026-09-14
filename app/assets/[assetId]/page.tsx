import { getDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

export default async function AssetReviewPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  const sql = getDatabase();
  const [asset] = await sql`
    select
      assets.id,
      assets.title,
      asset_versions.id as version_id,
      asset_versions.source_sha256,
      transform_jobs.id as rendition_id,
      transform_jobs.output_media_type,
      transform_jobs.duration_ms,
      reviews.id as review_id,
      reviews.state as review_state,
      reviews.revision
    from assets
    join asset_versions on asset_versions.asset_id = assets.id
    left join transform_jobs
      on transform_jobs.asset_version_id = asset_versions.id
      and transform_jobs.state = 'completed'
    left join reviews on reviews.asset_version_id = asset_versions.id
    where assets.id = ${assetId}
    order by asset_versions.version_number desc
    limit 1
  `;
  if (asset === undefined) {
    return <div className="page">Asset not found.</div>;
  }
  const annotations =
    asset.reviewId === null
      ? []
      : await sql`
          select *
          from annotations
          where review_id = ${asset.reviewId}
          order by timecode_ms, created_at
        `;
  const transcript = await sql`
    select *
    from transcript_cues
    where asset_version_id = ${asset.versionId}
    order by start_ms
  `;
  return (
    <div className="page">
      <section>
        <p className="eyebrow">Accessible review workspace</p>
        <h1>{asset.title}</h1>
        <p className="muted">
          Source lineage {asset.sourceSha256.slice(0, 20)}… · Review{" "}
          {asset.reviewState ?? "not requested"}
        </p>
        {asset.renditionId === null ? (
          <p>No review rendition is available.</p>
        ) : asset.outputMediaType === "video/mp4" ? (
          <video
            aria-label={`${asset.title} review rendition`}
            controls
            preload="metadata"
            src={`/api/renditions/${asset.renditionId}/content`}
          />
        ) : (
          <audio
            aria-label={`${asset.title} review rendition`}
            controls
            src={`/api/renditions/${asset.renditionId}/content`}
          />
        )}
      </section>
      <section className="two-column">
        <div>
          <h2>Transcript</h2>
          {transcript.map((cue) => (
            <p className="row" key={cue.id}>
              <time>{Math.floor(cue.startMs / 1_000)}s</time>
              <span>{cue.body}</span>
            </p>
          ))}
        </div>
        <div>
          <h2>Time-addressed annotations</h2>
          {annotations.length === 0 ? (
            <p className="muted">No reviewer annotations.</p>
          ) : (
            annotations.map((annotation) => (
              <p className="row" key={annotation.id}>
                <time>{annotation.timecodeMs / 1_000}s</time>
                <span>{annotation.body}</span>
              </p>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
