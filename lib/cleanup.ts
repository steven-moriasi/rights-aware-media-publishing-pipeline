import type { Database } from "./database";
import { removeObject } from "./object-storage";
import { appendAudit } from "./uploads";

export async function cleanupExpiredUploads(
  sql: Database,
  actorId: string,
) {
  return sql.begin(async (transaction) => {
    const uploads = await transaction<Array<{ id: string }>>`
      select id
      from upload_sessions
      where state in ('initiated', 'uploading')
        and expires_at <= now()
      for update skip locked
    `;
    let removedParts = 0;
    for (const upload of uploads) {
      const parts = await transaction<Array<{ objectKey: string }>>`
        select object_key
        from upload_parts
        where upload_id = ${upload.id}
      `;
      await transaction`
        update upload_sessions
        set state = 'expired', updated_at = now()
        where id = ${upload.id}
      `;
      for (const part of parts) {
        await removeObject(part.objectKey);
        removedParts += 1;
      }
      await transaction`
        delete from upload_parts
        where upload_id = ${upload.id}
      `;
    }
    const [run] = await transaction`
      insert into cleanup_runs (
        expired_uploads,
        removed_parts,
        actor_id
      )
      values (${uploads.length}, ${removedParts}, ${actorId})
      returning *
    `;
    await appendAudit(
      transaction,
      "uploads.cleaned",
      "cleanup-run",
      run.id,
      actorId,
      {
        expiredUploads: uploads.length,
        removedParts,
      },
    );
    return run;
  });
}
