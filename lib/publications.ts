import type { Database } from "./database";
import { evaluateRights, type GrantCandidate } from "./rights";
import { appendAudit } from "./uploads";

export class PublicationStateError extends Error {}

export type SandboxOutcome = "delivered" | "rejected" | "unknown";

export function sandboxOutcomeState(
  outcome: SandboxOutcome,
): "blocked" | "delivered" | "unknown" {
  if (outcome === "delivered") {
    return "delivered";
  }
  return outcome === "unknown" ? "unknown" : "blocked";
}

export async function createPublicationIntent(
  sql: Database,
  input: {
    assetVersionId: string;
    destination: string;
    idempotencyKey: string;
    renditionSpecId: string;
    scheduledFor: Date;
    territory: string;
  },
  actorId: string,
) {
  const [intent] = await sql`
    insert into publication_intents (
      asset_version_id,
      territory,
      destination,
      rendition_spec_id,
      idempotency_key,
      scheduled_for,
      requested_by
    )
    values (
      ${input.assetVersionId},
      ${input.territory},
      ${input.destination},
      ${input.renditionSpecId},
      ${input.idempotencyKey},
      ${input.scheduledFor},
      ${actorId}
    )
    on conflict (idempotency_key)
    do update set idempotency_key = excluded.idempotency_key
    returning *
  `;
  await appendAudit(
    sql,
    "publication.scheduled",
    "publication-intent",
    intent.id,
    actorId,
    { idempotencyKey: input.idempotencyKey },
  );
  return intent;
}

export async function executePublication(
  sql: Database,
  publicationIntentId: string,
  outcome: SandboxOutcome,
  actorId: string,
) {
  return sql.begin(async (transaction) => {
    const [intent] = await transaction<
      Array<{
        assetId: string;
        assetVersionId: string;
        destination: string;
        id: string;
        renditionSpecId: string;
        scheduledFor: Date;
        state: string;
        territory: string;
      }>
    >`
      select
        publication_intents.*,
        asset_versions.asset_id
      from publication_intents
      join asset_versions
        on asset_versions.id = publication_intents.asset_version_id
      where publication_intents.id = ${publicationIntentId}
      for update of publication_intents
    `;
    if (intent === undefined) {
      throw new PublicationStateError("Publication intent was not found.");
    }
    if (intent.state === "delivered" || intent.state === "revoked") {
      const [receipt] = await transaction`
        select *
        from delivery_receipts
        where publication_intent_id = ${publicationIntentId}
      `;
      return { decision: null, duplicate: true, intent, receipt };
    }
    if (!["scheduled", "unknown"].includes(intent.state)) {
      throw new PublicationStateError("Publication cannot execute.");
    }
    const [review] = await transaction<Array<{ state: string }>>`
      select state
      from reviews
      where asset_version_id = ${intent.assetVersionId}
    `;
    const grants = await transaction<Array<GrantCandidate>>`
      select
        destination,
        rendition_spec_id,
        state,
        territory,
        valid_from,
        valid_until
      from rights_grants
      where asset_id = ${intent.assetId}
    `;
    const now = new Date();
    const decision = evaluateRights(grants, {
      destination: intent.destination,
      now,
      renditionSpecId: intent.renditionSpecId,
      territory: intent.territory,
    });
    if (
      review?.state !== "approved" ||
      !decision.permitted ||
      intent.scheduledFor > now
    ) {
      const reason =
        review?.state !== "approved"
          ? "approval_required"
          : intent.scheduledFor > now
            ? "schedule_not_due"
            : decision.reasonCode;
      const [blocked] = await transaction`
        update publication_intents
        set
          state = 'blocked',
          blocked_reason = ${reason},
          updated_at = now()
        where id = ${publicationIntentId}
        returning *
      `;
      await appendAudit(
        transaction,
        "publication.blocked",
        "publication-intent",
        publicationIntentId,
        actorId,
        { reasonCode: reason },
      );
      return { decision, duplicate: false, intent: blocked, receipt: null };
    }
    const [{ nextAttempt }] = await transaction<
      Array<{ nextAttempt: number }>
    >`
      select coalesce(max(attempt_number), 0)::int + 1 as next_attempt
      from publication_attempts
      where publication_intent_id = ${publicationIntentId}
    `;
    const providerKey = `sandbox:${publicationIntentId}`;
    const nextState = sandboxOutcomeState(outcome);
    await transaction`
      insert into publication_attempts (
        publication_intent_id,
        attempt_number,
        provider_key,
        outcome,
        detail
      )
      values (
        ${publicationIntentId},
        ${nextAttempt},
        ${providerKey},
        ${outcome},
        ${transaction.json({ adapter: "deterministic-sandbox-v1" })}
      )
      on conflict (provider_key) do nothing
    `;
    let receipt = null;
    if (nextState === "delivered") {
      const [rendition] = await transaction<
        Array<{ outputObjectKey: string }>
      >`
        select output_object_key
        from transform_jobs
        where asset_version_id = ${intent.assetVersionId}
          and spec_id = ${intent.renditionSpecId}
          and state = 'completed'
      `;
      if (rendition === undefined) {
        throw new PublicationStateError("Publication rendition is unavailable.");
      }
      [receipt] = await transaction`
        insert into delivery_receipts (
          publication_intent_id,
          provider_delivery_id,
          rendition_object_key
        )
        values (
          ${publicationIntentId},
          ${providerKey},
          ${rendition.outputObjectKey}
        )
        on conflict (publication_intent_id)
        do nothing
        returning *
      `;
      if (receipt === undefined) {
        [receipt] = await transaction`
          select *
          from delivery_receipts
          where publication_intent_id = ${publicationIntentId}
        `;
      }
    }
    const [updated] = await transaction`
      update publication_intents
      set
        state = ${nextState},
        blocked_reason = ${outcome === "rejected" ? "sandbox_rejected" : null},
        updated_at = now()
      where id = ${publicationIntentId}
      returning *
    `;
    await appendAudit(
      transaction,
      `publication.${nextState}`,
      "publication-intent",
      publicationIntentId,
      actorId,
      { providerKey },
    );
    return { decision, duplicate: false, intent: updated, receipt };
  });
}

export async function reconcilePublication(
  sql: Database,
  publicationIntentId: string,
  foundDelivered: boolean,
  actorId: string,
) {
  if (!foundDelivered) {
    return { state: "unknown" };
  }
  return executePublication(sql, publicationIntentId, "delivered", actorId);
}

export async function revokePublication(
  sql: Database,
  publicationIntentId: string,
  reason: string,
  actorId: string,
) {
  return sql.begin(async (transaction) => {
    const [intent] = await transaction<Array<{ state: string }>>`
      select state
      from publication_intents
      where id = ${publicationIntentId}
      for update
    `;
    if (intent?.state !== "delivered") {
      throw new PublicationStateError(
        "Only a delivered publication can be revoked.",
      );
    }
    const [revocation] = await transaction`
      insert into publication_revocations (
        publication_intent_id,
        reason,
        requested_by
      )
      values (${publicationIntentId}, ${reason}, ${actorId})
      returning *
    `;
    await transaction`
      update publication_intents
      set state = 'revoked', updated_at = now()
      where id = ${publicationIntentId}
    `;
    await appendAudit(
      transaction,
      "publication.revoked",
      "publication-intent",
      publicationIntentId,
      actorId,
      { revocationId: revocation.id },
    );
    return revocation;
  });
}

export async function listPublishingState(sql: Database) {
  const grants = await sql`
    select rights_grants.*, assets.title
    from rights_grants
    join assets on assets.id = rights_grants.asset_id
    order by rights_grants.created_at desc
  `;
  const publications = await sql`
    select publication_intents.*, assets.title
    from publication_intents
    join asset_versions
      on asset_versions.id = publication_intents.asset_version_id
    join assets on assets.id = asset_versions.asset_id
    order by publication_intents.created_at desc
  `;
  return { grants, publications };
}
