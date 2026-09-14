import { getDatabase } from "@/lib/database";
import { listAssets } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const assets = await listAssets(getDatabase());
  return (
    <div className="page">
      <section>
        <p className="eyebrow">Immutable library</p>
        <h1>Available asset versions</h1>
        <div className="list">
          {assets.length === 0 ? (
            <p className="muted">No verified asset version exists yet.</p>
          ) : (
            assets.map((asset) => (
              <article className="row" key={asset.versionId}>
                <div>
                  <strong>{asset.title}</strong>
                  <p className="muted">
                    Version {asset.versionNumber} · {asset.mediaType}
                  </p>
                </div>
                <code>{asset.sourceSha256.slice(0, 16)}…</code>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
