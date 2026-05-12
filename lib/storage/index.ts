import "server-only";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getStorageClient } from "./client";

export const MEDIA_BUCKET = process.env.BUCKET_MEDIA_NAME ?? "media";

export async function uploadFile(
  path: string,
  body: Buffer,
  opts: { contentType: string },
): Promise<void> {
  const client = getStorageClient();
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
