import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

export function getStorageClient(): S3Client {
  if (_client) return _client;

  const endpoint = process.env.BUCKET_ENDPOINT;
  const region = process.env.BUCKET_REGION ?? "auto";
  const forcePathStyle = process.env.BUCKET_FORCE_PATH_STYLE === "true";
  const accessKeyId = process.env.BUCKET_MEDIA_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BUCKET_MEDIA_SECRET_ACCESS_KEY;

  if (!endpoint) throw new Error("BUCKET_ENDPOINT is not set");
  if (!accessKeyId) throw new Error("BUCKET_MEDIA_ACCESS_KEY_ID is not set");
  if (!secretAccessKey) throw new Error("BUCKET_MEDIA_SECRET_ACCESS_KEY is not set");

  _client = new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _client;
}
