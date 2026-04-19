/**
 * S3-compatible ObjectStorage implementation.
 *
 * Talks pure S3 API via SigV4. Works against AWS S3, R2 (S3 endpoint),
 * MinIO, Backblaze B2 S3, and Aliyun OSS S3-compatible mode — any backend
 * that implements the S3 object API surface we need.
 *
 * Use this when the code is not running on Cloudflare Workers (e.g.
 * future Node/Bun deploy) or when the deployment targets AWS S3 directly.
 * For CF Workers with R2, prefer R2BindingStorage — it's faster and
 * doesn't require S3 credentials for the hot path.
 */

import { presignUrl, signRequest, type SigV4Credentials } from "./sigv4";
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

export interface S3CompatibleStorageConfig {
  /** Bucket-level endpoint, no trailing slash, e.g. `https://s3.amazonaws.com`. */
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public URL prefix; defaults to `${endpoint}/${bucket}`. */
  publicUrlBase?: string;
  /**
   * Use path-style URLs (https://endpoint/bucket/key) vs virtual-hosted
   * (https://bucket.endpoint/key). R2, MinIO, and many OSS endpoints
   * require path-style; AWS accepts both.
   */
  forcePathStyle?: boolean;
}

async function bodyToBuffer(
  body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | Blob | string,
): Promise<{ bytes: Uint8Array; size: number }> {
  if (typeof body === "string") {
    const bytes = new TextEncoder().encode(body);
    return { bytes, size: bytes.byteLength };
  }
  if (body instanceof Uint8Array) {
    return { bytes: body, size: body.byteLength };
  }
  if (body instanceof ArrayBuffer) {
    const bytes = new Uint8Array(body);
    return { bytes, size: bytes.byteLength };
  }
  if (body instanceof Blob) {
    const buf = await body.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return { bytes, size: bytes.byteLength };
  }
  // ReadableStream — buffer to memory. Fine for the small images the
  // admin flow uploads (<10 MB). For larger files, switch callers to
  // presigned direct-upload or add multipart support here.
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes: merged, size: total };
}

/**
 * Parse the subset of S3 ListObjectsV2 XML we care about, without a DOM
 * parser (Workers don't expose DOMParser). Regex is sufficient because
 * we only read a handful of predictable fields.
 */
function parseListXml(xml: string): {
  items: ObjectHead[];
  truncated: boolean;
  cursor?: string;
} {
  const items: ObjectHead[] = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m: RegExpExecArray | null;
  while ((m = contentsRegex.exec(xml)) !== null) {
    const chunk = m[1]!;
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(chunk)?.[1];
    const size = /<Size>(\d+)<\/Size>/.exec(chunk)?.[1];
    const etag = /<ETag>"?([\s\S]*?)"?<\/ETag>/.exec(chunk)?.[1];
    const lastModified =
      /<LastModified>([\s\S]*?)<\/LastModified>/.exec(chunk)?.[1];
    if (key) {
      items.push({
        key,
        size: size ? parseInt(size, 10) : 0,
        etag,
        uploaded: lastModified ? new Date(lastModified) : undefined,
      });
    }
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const cursor =
    /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { items, truncated, cursor };
}

export class S3CompatibleStorage implements ObjectStorage {
  private readonly creds: SigV4Credentials;

  constructor(private readonly cfg: S3CompatibleStorageConfig) {
    this.creds = {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: "s3",
    };
  }

  private objectUrl(key: string): URL {
    const endpoint = this.cfg.endpoint.replace(/\/+$/, "");
    // Default to path-style. Virtual-hosted-style requires DNS setup and
    // isn't needed for any of the endpoints we care about.
    const pathStyle = this.cfg.forcePathStyle ?? true;
    if (pathStyle) {
      return new URL(`${endpoint}/${this.cfg.bucket}/${encodeURI(key)}`);
    }
    // Virtual hosted: move bucket into the hostname.
    const e = new URL(endpoint);
    e.hostname = `${this.cfg.bucket}.${e.hostname}`;
    e.pathname = `/${encodeURI(key)}`;
    return e;
  }

  private listUrl(prefix?: string, opts?: { cursor?: string; limit?: number }): URL {
    const endpoint = this.cfg.endpoint.replace(/\/+$/, "");
    const url = new URL(`${endpoint}/${this.cfg.bucket}`);
    url.searchParams.set("list-type", "2");
    if (prefix) url.searchParams.set("prefix", prefix);
    if (opts?.cursor) url.searchParams.set("continuation-token", opts.cursor);
    if (opts?.limit) url.searchParams.set("max-keys", String(opts.limit));
    return url;
  }

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | Blob | string,
    opts?: PutOptions,
  ): Promise<PutResult> {
    const { bytes, size } = await bodyToBuffer(body);
    const url = this.objectUrl(key);
    const headers: Record<string, string> = {};
    if (opts?.contentType) headers["content-type"] = opts.contentType;
    if (opts?.cacheControl) headers["cache-control"] = opts.cacheControl;
    if (opts?.metadata) {
      for (const [mk, mv] of Object.entries(opts.metadata)) {
        headers[`x-amz-meta-${mk.toLowerCase()}`] = mv;
      }
    }
    const signed = await signRequest(this.creds, {
      method: "PUT",
      url,
      headers,
      body: bytes,
    });
    const res = await fetch(url.toString(), {
      method: "PUT",
      headers: signed,
      body: bytes,
    });
    if (!res.ok) {
      throw new Error(
        `s3 put failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
    const etag = res.headers.get("etag") ?? undefined;
    return { key, size, etag };
  }

  async get(key: string): Promise<GetResult | null> {
    const url = this.objectUrl(key);
    const signed = await signRequest(this.creds, {
      method: "GET",
      url,
      headers: {},
      unsignedPayload: true,
    });
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: signed,
    });
    if (res.status === 404) return null;
    if (!res.ok || !res.body) {
      throw new Error(`s3 get failed: ${res.status}`);
    }
    return {
      body: res.body as ReadableStream<Uint8Array>,
      size: parseInt(res.headers.get("content-length") ?? "0", 10),
      contentType: res.headers.get("content-type") ?? undefined,
      etag: res.headers.get("etag") ?? undefined,
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    const url = this.objectUrl(key);
    const signed = await signRequest(this.creds, {
      method: "HEAD",
      url,
      headers: {},
      unsignedPayload: true,
    });
    const res = await fetch(url.toString(), {
      method: "HEAD",
      headers: signed,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`s3 head failed: ${res.status}`);
    const lm = res.headers.get("last-modified");
    return {
      key,
      size: parseInt(res.headers.get("content-length") ?? "0", 10),
      contentType: res.headers.get("content-type") ?? undefined,
      etag: res.headers.get("etag") ?? undefined,
      uploaded: lm ? new Date(lm) : undefined,
    };
  }

  async delete(key: string): Promise<void> {
    const url = this.objectUrl(key);
    const signed = await signRequest(this.creds, {
      method: "DELETE",
      url,
      headers: {},
      unsignedPayload: true,
    });
    const res = await fetch(url.toString(), {
      method: "DELETE",
      headers: signed,
    });
    // S3 returns 204 on successful delete, and 204 even when key is
    // already absent (idempotent). Only treat 4xx/5xx as failures.
    if (!res.ok && res.status !== 204) {
      throw new Error(`s3 delete failed: ${res.status}`);
    }
  }

  async list(
    prefix?: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<ListResult> {
    const url = this.listUrl(prefix, opts);
    const signed = await signRequest(this.creds, {
      method: "GET",
      url,
      headers: {},
      unsignedPayload: true,
    });
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: signed,
    });
    if (!res.ok) throw new Error(`s3 list failed: ${res.status}`);
    const xml = await res.text();
    return parseListXml(xml);
  }

  getPublicUrl(key: string): string {
    const base = (
      this.cfg.publicUrlBase ?? `${this.cfg.endpoint.replace(/\/+$/, "")}/${this.cfg.bucket}`
    ).replace(/\/+$/, "");
    return `${base}/${encodeURI(key)}`;
  }

  async getPresignedPutUrl(
    key: string,
    opts: PresignPutOptions,
  ): Promise<string> {
    const url = this.objectUrl(key);
    return presignUrl(this.creds, {
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
    const url = this.objectUrl(key);
    return presignUrl(this.creds, {
      method: "GET",
      url,
      expiresIn: opts?.expiresIn ?? 15 * 60,
    });
  }
}
