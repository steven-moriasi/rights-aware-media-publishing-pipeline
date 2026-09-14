import type { Database } from "./database";
import { appendAudit } from "./uploads";

export interface GrantCandidate {
  destination: string;
  renditionSpecId: string;
  state: string;
  territory: string;
  validFrom: Date;
  validUntil: Date;
}

export interface RightsDecision {
  permitted: boolean;
  reasonCode:
    | "active_grant"
    | "destination_not_granted"
    | "grant_expired"
    | "grant_not_started"
    | "rendition_not_granted"
    | "territory_not_granted";
}

export function evaluateRights(
  grants: GrantCandidate[],
  input: {
    destination: string;
    now: Date;
    renditionSpecId: string;
    territory: string;
  },
): RightsDecision {
  const active = grants.filter((grant) => grant.state === "active");
  const destination = active.filter(
    (grant) => grant.destination === input.destination,
  );
  if (destination.length === 0) {
    return { permitted: false, reasonCode: "destination_not_granted" };
  }
  const territory = destination.filter(
    (grant) =>
      grant.territory === "GLOBAL" || grant.territory === input.territory,
  );
  if (territory.length === 0) {
    return { permitted: false, reasonCode: "territory_not_granted" };
  }
  const rendition = territory.filter(
    (grant) => grant.renditionSpecId === input.renditionSpecId,
  );
  if (rendition.length === 0) {
    return { permitted: false, reasonCode: "rendition_not_granted" };
  }
  if (rendition.every((grant) => grant.validFrom > input.now)) {
    return { permitted: false, reasonCode: "grant_not_started" };
  }
  if (rendition.every((grant) => grant.validUntil <= input.now)) {
    return { permitted: false, reasonCode: "grant_expired" };
  }
  return { permitted: true, reasonCode: "active_grant" };
}

export async function createRightsGrant(
  sql: Database,
  input: {
    assetId: string;
    destination: string;
    renditionSpecId: string;
    territory: string;
    validFrom: Date;
    validUntil: Date;
  },
  actorId: string,
) {
  if (input.validUntil <= input.validFrom) {
    throw new Error("Rights grant validity is invalid.");
  }
  const [grant] = await sql`
    insert into rights_grants (
      asset_id,
      territory,
      valid_from,
      valid_until,
      rendition_spec_id,
      destination,
      granted_by
    )
    values (
      ${input.assetId},
      ${input.territory},
      ${input.validFrom},
      ${input.validUntil},
      ${input.renditionSpecId},
      ${input.destination},
      ${actorId}
    )
    returning *
  `;
  await appendAudit(sql, "rights-grant.created", "rights-grant", grant.id, actorId, {
    destination: input.destination,
    territory: input.territory,
  });
  return grant;
}
