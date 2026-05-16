import "server-only";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getStorageClient } from "./client";

export const MEDIA_BUCKET = process.env.BUCKET_MEDIA_NAME ?? "media";

/**
 * Cheap, no-throw check for whether the S3-compatible storage backend is
 * configured. Call this from route handlers BEFORE invoking `uploadFile` /
 * `downloadFile` / `deleteFile` so a missing env var degrades to a clean 503
 * instead of an uncaught `Error: BUCKET_ENDPOINT is not set` that surfaces as
 * a 500 with a stack trace.
 *
 * The full credential set is required — endpoint alone is not enough.
 */
export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.BUCKET_ENDPOINT &&
      process.env.BUCKET_MEDIA_ACCESS_KEY_ID &&
      process.env.BUCKET_MEDIA_SECRET_ACCESS_KEY,
  );
}

/**
 * Memoised one-shot bucket existence check. We only call HeadBucket on the
 * very first upload of a process; after that the bucket is assumed to exist.
 * If it doesn't, the PutObject call below will throw NoSuchBucket and we
 * fall through to `createMediaBucket` once.
 */
let bucketReady: Promise<void> | null = null;

async function ensureMediaBucket(): Promise<void> {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const client = getStorageClient();
    try {
      await client.send(new HeadBucketCommand({ Bucket: MEDIA_BUCKET }));
    } catch (err) {
      // 404 NoSuchBucket — create it. Anything else (403, 5xx) rethrows.
      const status = err instanceof S3ServiceException ? (err.$metadata.httpStatusCode ?? 0) : 0;
      if (status !== 404 && (err as { name?: string }).name !== "NotFound") {
        bucketReady = null; // allow retry on transient failures
        throw err;
      }
      await client.send(new CreateBucketCommand({ Bucket: MEDIA_BUCKET }));
    }
  })();
  return bucketReady;
}

export async function uploadFile(
  path: string,
  body: Buffer,
  opts: { contentType: string },
): Promise<void> {
  const client = getStorageClient();
  await ensureMediaBucket();
  await client.send(
    new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: path,
      Body: body,
      ContentType: opts.contentType,
    }),
  );
}

export async function downloadFile(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const client = getStorageClient();
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: path }));
    if (!res.Body) return null;
    const raw = await res.Body.transformToByteArray();
    // Narrow from Uint8Array<ArrayBufferLike> → Uint8Array<ArrayBuffer> (safe: SDK never uses SharedArrayBuffer)
    return new Uint8Array(raw.buffer as ArrayBuffer, raw.byteOffset, raw.byteLength);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "NoSuchKey") return null;
    throw err;
  }
}

export async function deleteFile(path: string): Promise<void> {
  const client = getStorageClient();
  await client.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: path }));
}
