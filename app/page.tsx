import Link from "next/link";

const guarantees = [
  "Upload completion never implies availability: checksum and scan promotion are explicit.",
  "Every rendition retains immutable source checksum and transform-spec lineage.",
  "Approval and rights are re-evaluated when publication executes.",
  "Delivery timeouts remain unknown until reconciliation proves an outcome.",
];

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Synthetic media lifecycle reference system</p>
        <h1>Publish media without losing lineage, rights, or truth.</h1>
        <p>
          FrameRights demonstrates resumable ingest, reproducible transforms,
          accessible review, bounded rights, and recoverable sandbox delivery.
        </p>
        <div className="actions">
          <Link className="button primary" href="/uploads">
            Start synthetic ingest
          </Link>
          <Link className="button" href="/operations">
            Inspect operations
          </Link>
        </div>
      </section>
      <section aria-labelledby="guarantees">
        <p className="eyebrow">System guarantees</p>
        <h2 id="guarantees">Lifecycle evidence, not digital-asset CRUD</h2>
        <div className="card-grid">
          {guarantees.map((guarantee, index) => (
            <article className="card" key={guarantee}>
              <span>0{index + 1}</span>
              <p>{guarantee}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="boundary">
        <h2>Truth boundary</h2>
        <p>
          This project does not claim studio-scale throughput, DRM, broadcast
          compliance, universal frame accuracy, real CDN delivery, or
          third-party media ownership.
        </p>
      </section>
    </div>
  );
}
