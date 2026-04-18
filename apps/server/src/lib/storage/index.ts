/**
 * Object storage factory.
 *
 * Resolves a concrete ObjectStorage implementation from environment
 * variables so business code can depend on the abstract interface and
 * swap backends via config alone.
 *
 * Recognised env vars (see `.dev.vars`):
 *   STORAGE_DRIVER         = "r2" | "s3"     (default: "r2")
 *   MEDIA_PUBLIC_URL_BASE  = "https://cdn..."  (optional; see R2BindingStorage)
 *
 * R2 driver — uses env.MEDIA_R2 binding for the hot path. Presigned URLs
 * additionally require S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID /
 * S3_SECRET_ACCESS_KEY. The hot path (put/get/delete/list/head) works
 * without those.
 *
 * S3 driver — requires S3_ENDPOINT, S3_BUCKET, S3_REGION,
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY. Use when running off-Cloudflare
 * or pointing at real AWS S3 / MinIO.
 */

import { R2BindingStorage } from "./r2-binding";
import { S3CompatibleStorage } from "./s3-compatible";
import type { ObjectStorage, StorageDriver } from "./types";

export * from "./types";
export { R2BindingStorage } from "./r2-binding";
export { S3CompatibleStorage } from "./s3-compatible";

export interface StorageEnv {
  STORAGE_DRIVER?: string;
  MEDIA_PUBLIC_URL_BASE?: string;
  MEDIA_R2?: R2Bucket;
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE?: string;
}

export function createObjectStorage(env: StorageEnv): ObjectStorage {
  const driver = (env.STORAGE_DRIVER ?? "r2") as StorageDriver;

  if (driver === "r2") {
    if (!env.MEDIA_R2) {
      throw new Error(
        "STORAGE_DRIVER=r2 but env.MEDIA_R2 binding is missing. " +
          "Ensure wrangler.jsonc has r2_buckets entry with binding 'MEDIA_R2'.",
      );
    }
    return new R2BindingStorage({
      bucket: env.MEDIA_R2,
      publicUrlBase: env.MEDIA_PUBLIC_URL_BASE,
      s3:
        env.S3_ENDPOINT &&
        env.S3_BUCKET &&
        env.S3_ACCESS_KEY_ID &&
        env.S3_SECRET_ACCESS_KEY
          ? {
              endpoint: env.S3_ENDPOINT,
              bucketName: env.S3_BUCKET,
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  if (driver === "s3") {
    const missing: string[] = [];
    if (!env.S3_ENDPOINT) missing.push("S3_ENDPOINT");
    if (!env.S3_BUCKET) missing.push("S3_BUCKET");
    if (!env.S3_REGION) missing.push("S3_REGION");
    if (!env.S3_ACCESS_KEY_ID) missing.push("S3_ACCESS_KEY_ID");
    if (!env.S3_SECRET_ACCESS_KEY) missing.push("S3_SECRET_ACCESS_KEY");
    if (missing.length > 0) {
      throw new Error(
        `STORAGE_DRIVER=s3 but missing env: ${missing.join(", ")}`,
      );
    }
    return new S3CompatibleStorage({
      endpoint: env.S3_ENDPOINT!,
      bucket: env.S3_BUCKET!,
      region: env.S3_REGION!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      publicUrlBase: env.MEDIA_PUBLIC_URL_BASE,
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    });
  }

  throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
}
