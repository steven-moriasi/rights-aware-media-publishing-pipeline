import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import postgres from "postgres";

import { requiredEnvironment } from "../lib/database";
import {
  getObject,
  putObject,
} from "../lib/object-storage";
import { retryState } from "../lib/transforms";

interface TransformJob {
  id: string;
  assetVersionId: string;
  attempts: number;
  sourceObjectKey: string;
  sourceSha256: string;
  mediaType: string;
}

interface ProbeOutput {
  format?: { duration?: string };
  streams?: Array<{
    codecType?: string;
    height?: number;
    width?: number;
  }>;
}

const sql = postgres(requiredEnvironment("DATABASE_URL"), {
  max: 1,
  transform: postgres.camel,
});
const workerId = requiredEnvironment("WORKER_ID");

async function runProcess(
  command: string,
  arguments_: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, arguments_, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    process.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    process.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output).toString("utf8"));
      } else {
        reject(
          new Error(
            Buffer.concat(errors).toString("utf8").slice(-2_000) ||
              `${command} exited with ${code}.`,
          ),
        );
      }
    });
  });
}

async function leaseJob(): Promise<TransformJob | null> {
  const [job] = await sql<Array<TransformJob>>`
    with candidate as (
      select transform_jobs.id
      from transform_jobs
      where
        state = 'queued'
        or (state = 'leased' and lease_until < now())
      order by created_at
      for update skip locked
      limit 1
    )
    update transform_jobs
    set
      state = 'leased',
      attempts = attempts + 1,
      worker_id = ${workerId},
      lease_until = now() + interval '45 seconds',
      updated_at = now()
    from candidate, asset_versions
    where transform_jobs.id = candidate.id
      and asset_versions.id = transform_jobs.asset_version_id
    returning
      transform_jobs.id,
      transform_jobs.asset_version_id,
      transform_jobs.attempts,
      asset_versions.source_object_key,
      asset_versions.source_sha256,
      asset_versions.media_type
  `;
  return job ?? null;
}

async function processJob(job: TransformJob): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "framerights-"));
  const sourcePath = join(directory, "source");
  const outputIsVideo = job.mediaType === "video/mp4";
  const outputPath = join(directory, outputIsVideo ? "review.mp4" : "review.mp3");
  try {
    const source = await getObject(job.sourceObjectKey);
    if (createHash("sha256").update(source).digest("hex") !== job.sourceSha256) {
      throw new Error("Source checksum no longer matches immutable lineage.");
    }
    await writeFile(sourcePath, source);
    const arguments_ = outputIsVideo
      ? [
          "-y",
          "-i",
          sourcePath,
          "-vf",
          "scale=min(640\\,iw):-2",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "28",
          "-an",
          outputPath,
        ]
      : [
          "-y",
          "-i",
          sourcePath,
          "-c:a",
          "libmp3lame",
          "-b:a",
          "128k",
          outputPath,
        ];
    await runProcess("ffmpeg", arguments_);
    const probe = JSON.parse(
      await runProcess("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        outputPath,
      ]),
    ) as ProbeOutput;
    const output = await readFile(outputPath);
    const outputSha256 = createHash("sha256").update(output).digest("hex");
    const outputObjectKey = `assets/${job.assetVersionId}/renditions/review-v1/${outputSha256}`;
    const videoStream = probe.streams?.find(
      (stream) => stream.codecType === "video",
    );
    const durationMs = Math.round(
      Number(probe.format?.duration ?? "0") * 1_000,
    );
    await putObject(
      outputObjectKey,
      output,
      outputIsVideo ? "video/mp4" : "audio/mpeg",
    );
    await sql.begin(async (transaction) => {
      await transaction`
        update transform_jobs
        set
          state = 'completed',
          output_object_key = ${outputObjectKey},
          output_sha256 = ${outputSha256},
          output_size_bytes = ${output.byteLength},
          output_media_type = ${outputIsVideo ? "video/mp4" : "audio/mpeg"},
          duration_ms = ${durationMs},
          width = ${videoStream?.width ?? null},
          height = ${videoStream?.height ?? null},
          lease_until = null,
          last_error = null,
          completed_at = now(),
          updated_at = now()
        where id = ${job.id}
          and worker_id = ${workerId}
      `;
      if (durationMs > 0) {
        await transaction`
          insert into transcript_cues (
            asset_version_id,
            start_ms,
            end_ms,
            body
          )
          values (
            ${job.assetVersionId},
            0,
            ${durationMs},
            ${"Synthetic fixture. No speech-to-text claim is made."}
          )
          on conflict do nothing
        `;
      }
      await transaction`
        insert into audit_events (
          event_type,
          aggregate_type,
          aggregate_id,
          actor_id,
          detail
        )
        values (
          'transform.completed',
          'transform-job',
          ${job.id},
          ${workerId},
          ${transaction.json({ outputSha256 })}
        )
      `;
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function failJob(job: TransformJob, error: unknown): Promise<void> {
  const message =
    error instanceof Error ? error.message.slice(-2_000) : "Unknown failure.";
  const state = retryState(job.attempts);
  await sql`
    update transform_jobs
    set
      state = ${state},
      lease_until = null,
      last_error = ${message},
      updated_at = now()
    where id = ${job.id}
      and worker_id = ${workerId}
  `;
}

async function main(): Promise<void> {
  for (;;) {
    let job: TransformJob | null;
    try {
      job = await leaseJob();
    } catch (error) {
      console.error(
        "transform lease failed",
        error instanceof Error ? error.message : "unknown database error",
      );
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    if (job === null) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
    try {
      await processJob(job);
    } catch (error) {
      await failJob(job, error);
    }
  }
}

await main();
