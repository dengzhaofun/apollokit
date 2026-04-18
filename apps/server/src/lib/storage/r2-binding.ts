/**
 * R2 binding-backed ObjectStorage implementation.
 *
 * Uses Cloudflare's native `R2Bucket` binding for put/get/head/delete/list
 * (fastest, no extra RTT). For pre-signed URLs we fall back to SigV4
 * against R2's S3 endpoint — the binding doesn't expose a presign API,
 * so this requires the R2 S3 credentials to be provisioned when any
 * presigned path is used.
 */

import { presignUrl, type SigV4Credentials } from "./sigv4";
import type {
  GetResult,
  ListResult,
  ObjectHead,
  ObjectStorage,
  PresignGetOptions,
  PresignPutOptions,
  PutOptions,
  PutResult,
} from "./types";

export interface R2BindingStorageConfig {
  bucket: R2Bucket;
  /**
   * Absolute URL prefix for public object access, e.g.
   * `https://cdn.example.com` or `https://pub-xxx.r2.dev`. If left
   * undefined, `getPublicUrl` returns a relative path under
   * `/api/media-library/object/` so a worker proxy route can serve the
   * object — useful for local dev without R2 custom domains.
   */
  publicUrlBase?: string;
  /**
   * Optional S3 credentials for R2. Only needed when callers request
   * presigned URLs. `endpoint` is the bucket-level S3 endpoint, e.g.
   * `https://<account-id>.r2.cloudflarestorage.com`. `bucketName` is the
   * R2 bucket name (not the binding name).
   */
  s3?: {
    endpoint: string;
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

function toObjectHead(obj: {
  key: string;
  size: number;
  etag?: string;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
}): ObjectHead {
  return {
    key: obj.key,
    size: obj.size,
    etag: obj.etag,
    uploaded: obj.uploaded,
    contentType: obj.httpMetadata?.contentType,
  };
}

export class R2BindingStorage implements ObjectStorage {
  constructor(private readonly cfg: R2BindingStorageConfig) {}

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | Blob | string,
    opts?: PutOptions,
  ): Promise<PutResult> {
    // R2Bucket.put accepts ReadableStream, ArrayBuffer, ArrayBufferView,
    // Blob, and string directly.
    const obj = await this.cfg.bucket.put(key, body as never, {
      httpMetadata: {
        contentType: opts?.contentType,
        cacheControl: opts?.cacheControl,
      },
      customMetadata: opts?.metadata,
    });
    if (!obj) {
      throw new Error(`r2 put returned null for key ${key}`);
    }
    return { key: obj.key, size: obj.size, etag: obj.etag };
  }

  async get(key: string): Promise<GetResult | null> {
    const obj = await this.cfg.bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body as ReadableStream<Uint8Array>,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType,
      etag: obj.etag,
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    const obj = await this.cfg.bucket.head(key);
    if (!obj) return null;
    return toObjectHead(obj);
  }

  async delete(key: string): Promise<void> {
    await this.cfg.bucket.delete(key);
  }

  async list(
    prefix?: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<ListResult> {
    const res = await this.cfg.bucket.list({
      prefix,
      cursor: opts?.cursor,
      limit: opts?.limit,
    });
    return {
      items: res.objects.map(toObjectHead),
      truncated: res.truncated,
      cursor: res.truncated ? res.cursor : undefined,
    };
  }

  getPublicUrl(key: string): string {
    if (this.cfg.publicUrlBase) {
      const base = this.cfg.publicUrlBase.replace(/\/+$/, "");
      return `${base}/${encodeURI(key)}`;
    }
    // Fallback: server-side proxy. The admin api-client prefixes this
    // with VITE_AUTH_SERVER_URL, so returning a relative path is OK.
    return `/api/media-library/object/${encodeURIComponent(key)}`;
  }

  private requireS3Creds(): {
    creds: SigV4Credentials;
    endpoint: string;
    bucketName: string;
  } {
    if (!this.cfg.s3) {
      throw new Error(
        "R2 S3 credentials not configured; cannot generate presigned URLs. " +
          "Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET.",
      );
    }
    const { endpoint, bucketName, accessKeyId, secretAccessKey } = this.cfg.s3;
    return {
      endpoint,
      bucketName,
      creds: {
        accessKeyId,
        secretAccessKey,
        // R2 S3 API uses region "auto"; true AWS would set us-east-1 etc.
        region: "auto",
        service: "s3",
      },
    };
  }

  async getPresignedPutUrl(
    key: string,
    opts: PresignPutOptions,
  ): Promise<string> {
    const { creds, endpoint, bucketName } = this.requireS3Creds();
    const url = new URL(
      `${endpoint.replace(/\/+$/, "")}/${bucketName}/${encodeURI(key)}`,
    );
    return presignUrl(creds, {
      method: "PUT",
      url,
      signedHeaders: { "content-type": opts.contentType },
      expiresIn: opts.expiresIn ?? 15 * 60,
    });
  }

  async getPresignedGetUrl(
    key: string,
    opts?: PresignGetOptions,
  ): Promise<string> {
    const { creds, endpoint, bucketName } = this.requireS3Creds();
    const url = new URL(
      `${endpoint.replace(/\/+$/, "")}/${bucketName}/${encodeURI(key)}`,
    );
    return presignUrl(creds, {
      method: "GET",
      url,
      expiresIn: opts?.expiresIn ?? 15 * 60,
    });
  }
}
