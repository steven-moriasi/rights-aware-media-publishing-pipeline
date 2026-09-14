import { getDatabase } from "@/lib/database";
import { listTransformJobs } from "@/lib/transforms";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const jobs = await listTransformJobs(getDatabase());
  return (
    <div className="page">
      <section>
        <p className="eyebrow">Worker diagnostics</p>
        <h1>Transform and delivery operations</h1>
        <p className="muted">
          Queue age, attempts, quarantine, unknown delivery age, cleanup, and
          recovery are intentionally visible without exposing media content.
        </p>
        <div className="list">
          {jobs.length === 0 ? (
            <p className="muted">No transform jobs.</p>
          ) : (
            jobs.map((job) => (
              <article className="row" key={job.id}>
                <span>{job.title}</span>
                <strong>{job.state}</strong>
                <small>{job.attempts} attempt(s)</small>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
