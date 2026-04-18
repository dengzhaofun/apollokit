/**
 * Vendor-agnostic object-storage interface.
 *
 * All media-library business code depends only on this interface. Concrete
 * implementations (R2BindingStorage, S3CompatibleStorage) live next to
 * this file. Switching vendors is a config change, not a code change.
 *
 * Keep the surface narrow — only what the admin media-library actually
 * uses. Add methods when a new caller genuinely needs them.
 */

export interface PutOptions {
  contentType?: string;
  cacheControl?: string;
  /**
   * Key-value metadata stored alongside the object. R2 and S3 both
   * support this under different header prefixes; implementations
   * normalize.
   */
  metadata?: Record<string, string>;
}

export interface PutResult {
  key: string;
  size: number;
  etag?: string;
}

export interface ObjectHead {
  key: string;
  size: number;
  contentType?: string;
  uploaded?: Date;
  etag?: string;
}

export interface GetResult {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType?: string;
  etag?: string;
}

export interface ListResult {
  items: ObjectHead[];
  truncated: boolean;
  cursor?: string;
}

export interface PresignPutOptions {
  contentType: string;
  expiresIn?: number;
}

export interface PresignGetOptions {
  expiresIn?: number;
}

export interface ObjectStorage {
  /** Upload or overwrite an object at `key`. */
  put(
    key: string,
    body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | Blob | string,
    opts?: PutOptions,
  ): Promise<PutResult>;

  /** Fetch an object; returns `null` when the key does not exist. */
  get(key: string): Promise<GetResult | null>;

  /** Fetch just the metadata for an object; `null` if absent. */
  head(key: string): Promise<ObjectHead | null>;

  /** Remove an object. Silent when the key does not exist. */
  delete(key: string): Promise<void>;

  /** Paginated prefix listing. */
  list(
    prefix?: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<ListResult>;

  /**
   * Public URL a browser can fetch the object at. Pure string assembly;
   * does not hit the network. For R2 this is the custom domain / r2.dev
   * URL; for S3 it's `https://<bucket>.s3.<region>.amazonaws.com/<key>`
   * (or a custom CDN).
   */
  getPublicUrl(key: string): string;

  /** SigV4 pre-signed PUT URL for browser direct upload. */
  getPresignedPutUrl(key: string, opts: PresignPutOptions): Promise<string>;

  /** SigV4 pre-signed GET URL for browser download (private buckets). */
  getPresignedGetUrl(key: string, opts?: PresignGetOptions): Promise<string>;
}

export type StorageDriver = "r2" | "s3";
