import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { requiredEnvironment } from "./database";

let client: S3Client | null = null;

function storageClient(): S3Client {
  if (client === null) {
    const scheme =
      requiredEnvironment("OBJECT_USE_SSL") === "true" ? "https" : "http";
    client = new S3Client({
      credentials: {
        accessKeyId: requiredEnvironment("OBJECT_ACCESS_KEY"),
        secretAccessKey: requiredEnvironment("OBJECT_SECRET_KEY"),
      },
      endpoint: `${scheme}://${requiredEnvironment("OBJECT_ENDPOINT")}:${requiredEnvironment("OBJECT_PORT")}`,
      forcePathStyle: true,
      region: "us-east-1",
    });
  }
  return client;
}

export async function ensureBucket(): Promise<void> {
  const Bucket = requiredEnvironment("OBJECT_BUCKET");
  try {
    await storageClient().send(new HeadBucketCommand({ Bucket }));
  } catch {
    try {
      await storageClient().send(new CreateBucketCommand({ Bucket }));
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "BucketAlreadyOwnedByYou") {
        throw error;
      }
    }
  }
}

export async function putObject(
  objectKey: string,
  value: Buffer,
  mediaType = "application/octet-stream",
): Promise<void> {
  await ensureBucket();
  await storageClient().send(
    new PutObjectCommand({
      Body: value,
      Bucket: requiredEnvironment("OBJECT_BUCKET"),
      ContentLength: value.byteLength,
      ContentType: mediaType,
      Key: objectKey,
    }),
  );
}

export async function getObject(objectKey: string): Promise<Buffer> {
  const response = await storageClient().send(
    new GetObjectCommand({
      Bucket: requiredEnvironment("OBJECT_BUCKET"),
      Key: objectKey,
    }),
  );
  if (response.Body === undefined) {
    throw new Error("Object storage returned an empty body.");
  }
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function removeObject(objectKey: string): Promise<void> {
  await storageClient().send(
    new DeleteObjectCommand({
      Bucket: requiredEnvironment("OBJECT_BUCKET"),
      Key: objectKey,
    }),
  );
}

export async function signedObjectUrl(
  objectKey: string,
  expiresSeconds: number,
): Promise<string> {
  return getSignedUrl(
    storageClient(),
    new GetObjectCommand({
      Bucket: requiredEnvironment("OBJECT_BUCKET"),
      Key: objectKey,
    }),
    { expiresIn: expiresSeconds },
  );
}
