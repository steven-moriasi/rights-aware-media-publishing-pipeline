import { getDatabase } from "@/lib/database";
import { listPublishingState } from "@/lib/publications";

export const dynamic = "force-dynamic";

export default async function PublishingPage() {
  const { grants, publications } = await listPublishingState(getDatabase());
  return (
    <div className="page">
      <section>
        <p className="eyebrow">Execution-time policy</p>
        <h1>Rights and publication state</h1>
        <p className="muted">
          Approval, territory, destination, rendition, and validity are checked
          again when delivery executes.
        </p>
      </section>
      <section className="two-column">
        <div>
          <h2>Rights grants</h2>
          {grants.map((grant) => (
            <article className="row" key={grant.id}>
              <span>{grant.title}</span>
              <strong>{grant.territory}</strong>
              <small>{grant.state}</small>
            </article>
          ))}
        </div>
        <div>
          <h2>Publication intents</h2>
          {publications.map((publication) => (
            <article className="row" key={publication.id}>
              <span>{publication.title}</span>
              <strong>{publication.territory}</strong>
              <small>{publication.state}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
