import { createHash } from "node:crypto";

import type { Database } from "./database";
import {
  getObject,
  putObject,
  removeObject,
} from "./object-storage";

export const maxUploadBytes = 25 * 1024 * 1024;
export const maxPartBytes = 5 * 1024 * 1024;
export const supportedMediaTypes = ["video/mp4", "audio/wav"] as const;

type SupportedMediaType = (typeof supportedMediaTypes)[number];

interface UploadSession {
  id: string;
  title: string;
  fileName: string;
  mediaType: string;
  expectedSize: string;
  expectedSha256: string;
  state: string;
  createdBy: string;
  expiresAt: Date;
  promotedVersionId: string | null;
}

interface UploadPart {
  partNumber: number;
  sizeBytes: number;
  sha256: string;
  objectKey: string;
}

export interface UploadInspection {
  accepted: boolean;
  reasonCode:
    | "accepted"
    | "checksum_mismatch"
    | "malware_signature"
    | "media_signature_mismatch"
    | "size_mismatch"
    | "unsupported_media_type";
}

export class UploadStateError extends Error {}

export function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function partsAreContiguous(parts: UploadPart[]): boolean {
  return parts.every((part, index) => part.partNumber === index + 1);
}

export function inspectUpload(input: {
  actualSha256: string;
  bytes: Buffer;
  expectedSha256: string;
  expectedSize: number;
  mediaType: string;
}): UploadInspection {
  if (!supportedMediaTypes.includes(input.mediaType as SupportedMediaType)) {
    return { accepted: false, reasonCode: "unsupported_media_type" };
  }
  if (input.bytes.byteLength !== input.expectedSize) {
    return { accepted: false, reasonCode: "size_mismatch" };
  }
  if (input.actualSha256 !== input.expectedSha256) {
    return { accepted: false, reasonCode: "checksum_mismatch" };
  }
  if (input.bytes.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))) {
    return { accepted: false, reasonCode: "malware_signature" };
  }
  const signatureMatches =
    input.mediaType === "audio/wav"
      ? input.bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        input.bytes.subarray(8, 12).toString("ascii") === "WAVE"
      : input.bytes.subarray(4, 8).toString("ascii") === "ftyp";
  if (!signatureMatches) {
    return { accepted: false, reasonCode: "media_signature_mismatch" };
  }
  return { accepted: true, reasonCode: "accepted" };
}

export async function createUpload(
  sql: Database,
  input: {
    title: string;
    fileName: string;
    mediaType: string;
    expectedSize: number;
    expectedSha256: string;
  },
  actorId: string,
) {
  if (
    input.expectedSize < 1 ||
    input.expectedSize > maxUploadBytes ||
    !/^[a-f0-9]{64}$/.test(input.expectedSha256)
  ) {
    throw new UploadStateError("Upload size or checksum is invalid.");
  }
  const [session] = await sql<Array<UploadSession>>`
    insert into upload_sessions (
      title,
      file_name,
      media_type,
      expected_size,
      expected_sha256,
      created_by
    )
    values (
      ${input.title},
      ${input.fileName},
      ${input.mediaType},
      ${input.expectedSize},
      ${input.expectedSha256},
      ${actorId}
    )
    returning *
  `;
  return session;
}

export async function writeUploadPart(
  sql: Database,
  uploadId: string,
  partNumber: number,
  bytes: Buffer,
  actorId: string,
) {
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > maxPartBytes ||
    partNumber < 1 ||
    partNumber > 100
  ) {
    throw new UploadStateError("Upload part is outside the supported bounds.");
  }
  const [session] = await sql<Array<UploadSession>>`
    select *
    from upload_sessions
    where id = ${uploadId}
  `;
  if (
    session === undefined ||
    session.createdBy !== actorId ||
    !["initiated", "uploading"].includes(session.state)
  ) {
    throw new UploadStateError("Upload session cannot accept parts.");
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    await sql`
      update upload_sessions
      set state = 'expired', updated_at = now()
      where id = ${uploadId}
    `;
    throw new UploadStateError("Upload session expired.");
  }
  const objectKey = `staging/${uploadId}/parts/${partNumber}`;
  const checksum = sha256(bytes);
  await putObject(objectKey, bytes);
  await sql`
    insert into upload_parts (
      upload_id,
      part_number,
      size_bytes,
      sha256,
      object_key
    )
    values (
      ${uploadId},
      ${partNumber},
      ${bytes.byteLength},
      ${checksum},
      ${objectKey}
    )
    on conflict (upload_id, part_number)
    do update set
      size_bytes = excluded.size_bytes,
      sha256 = excluded.sha256,
      object_key = excluded.object_key,
      created_at = now()
  `;
  await sql`
    update upload_sessions
    set state = 'uploading', updated_at = now()
    where id = ${uploadId}
  `;
  return { checksum, objectKey, partNumber, sizeBytes: bytes.byteLength };
}

export async function completeUpload(
  sql: Database,
  uploadId: string,
  actorId: string,
) {
  return sql.begin(async (transaction) => {
    const [session] = await transaction<Array<UploadSession>>`
      select *
      from upload_sessions
      where id = ${uploadId}
      for update
    `;
    if (session === undefined || session.createdBy !== actorId) {
      throw new UploadStateError("Upload session was not found.");
    }
    if (
      session.state === "promoted" &&
      session.promotedVersionId !== null
    ) {
      const [version] = await transaction`
        select *
        from asset_versions
        where id = ${session.promotedVersionId}
      `;
      return { duplicate: true, inspection: null, version };
    }
    if (!["initiated", "uploading"].includes(session.state)) {
      throw new UploadStateError("Upload session cannot be completed.");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await transaction`
        update upload_sessions
        set state = 'expired', updated_at = now()
        where id = ${uploadId}
      `;
      throw new UploadStateError("Upload session expired.");
    }
    const parts = await transaction<Array<UploadPart>>`
      select part_number, size_bytes, sha256, object_key
      from upload_parts
      where upload_id = ${uploadId}
      order by part_number
    `;
    if (parts.length === 0 || !partsAreContiguous(parts)) {
      throw new UploadStateError("Upload parts are incomplete.");
    }
    await transaction`
      update upload_sessions
      set state = 'verifying', updated_at = now()
      where id = ${uploadId}
    `;
    const bytes = Buffer.concat(
      await Promise.all(parts.map((part) => getObject(part.objectKey))),
    );
    const actualSha256 = sha256(bytes);
    const inspection = inspectUpload({
      actualSha256,
      bytes,
      expectedSha256: session.expectedSha256,
      expectedSize: Number(session.expectedSize),
      mediaType: session.mediaType,
    });
    if (!inspection.accepted) {
      await transaction`
        update upload_sessions
        set state = 'quarantined', updated_at = now()
        where id = ${uploadId}
      `;
      await transaction`
        insert into quarantine_records (upload_id, reason_code, detail)
        values (
          ${uploadId},
          ${inspection.reasonCode},
          ${"Verification refused immutable promotion."}
        )
      `;
      await appendAudit(
        transaction,
        "upload.quarantined",
        "upload",
        uploadId,
        actorId,
        { reasonCode: inspection.reasonCode },
      );
      return { duplicate: false, inspection, version: null };
    }
    const [asset] = await transaction`
      insert into assets (title, created_by)
      values (${session.title}, ${actorId})
      returning *
    `;
    const sourceObjectKey = `assets/${asset.id}/versions/1/source`;
    await putObject(sourceObjectKey, bytes, session.mediaType);
    const [version] = await transaction`
      insert into asset_versions (
        asset_id,
        version_number,
        source_object_key,
        source_sha256,
        media_type,
        size_bytes,
        scan_status,
        status,
        created_by
      )
      values (
        ${asset.id},
        1,
        ${sourceObjectKey},
        ${actualSha256},
        ${session.mediaType},
        ${bytes.byteLength},
        'clean',
        'available',
        ${actorId}
      )
      returning *
    `;
    await transaction`
      update upload_sessions
      set
        state = 'promoted',
        promoted_version_id = ${version.id},
        updated_at = now()
      where id = ${uploadId}
    `;
    await appendAudit(
      transaction,
      "asset-version.promoted",
      "asset-version",
      version.id,
      actorId,
      {
        sourceSha256: actualSha256,
        uploadId,
      },
    );
    await Promise.all(parts.map((part) => removeObject(part.objectKey)));
    return { duplicate: false, inspection, version };
  });
}

export async function appendAudit(
  sql: Database,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  actorId: string,
  detail: Record<string, string | number | boolean | null>,
): Promise<void> {
  await sql`
    insert into audit_events (
      event_type,
      aggregate_type,
      aggregate_id,
      actor_id,
      detail
    )
    values (
      ${eventType},
      ${aggregateType},
      ${aggregateId},
      ${actorId},
      ${sql.json(detail)}
    )
  `;
}

export async function listUploads(sql: Database) {
  return sql`
    select
      id,
      title,
      file_name,
      media_type,
      expected_size,
      state,
      created_by,
      expires_at,
      created_at
    from upload_sessions
    order by created_at desc
    limit 50
  `;
}

export async function listAssets(sql: Database) {
  return sql`
    select
      assets.id,
      assets.title,
      assets.created_by,
      assets.created_at,
      asset_versions.id as version_id,
      asset_versions.version_number,
      asset_versions.media_type,
      asset_versions.size_bytes,
      asset_versions.source_sha256,
      asset_versions.status
    from assets
    join asset_versions on asset_versions.asset_id = assets.id
    order by assets.created_at desc, asset_versions.version_number desc
  `;
}
