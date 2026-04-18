/**
 * Minimal AWS Signature V4 implementation for Cloudflare Workers.
 *
 * We use this both for R2's S3 API (presigned URLs) and for a full S3
 * compatible storage backend. Intentionally hand-rolled and inlined
 * rather than pulling in `aws4fetch`:
 *
 *   1. aws4fetch is a solid library but ~6 KB minified adds a build-time
 *      dependency that we'd hit on every cold start.
 *   2. Our surface is tiny — `PUT`, `GET`, `HEAD`, `DELETE`, `LIST` and
 *      query-signed URLs. Hand-rolling keeps control flow obvious.
 *   3. The SigV4 algorithm is stable and well-documented; Web Crypto on
 *      Workers gives us SHA-256 and HMAC natively.
 *
 * Reference: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 *
 * Works unchanged against AWS S3, R2, MinIO, Backblaze B2 S3 endpoint,
 * and Aliyun OSS S3-compatible mode.
 */

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string; // always "s3" for our needs
}

const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const ALGORITHM = "AWS4-HMAC-SHA256";

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

async function sha256(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

async function hmac(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
}

async function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(
    new TextEncoder().encode(`AWS4${secretAccessKey}`),
    dateStamp,
  );
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

/**
 * URI-encode a path segment per AWS spec: every byte that isn't
 * unreserved (`A-Za-z0-9-_.~`) or `/` is percent-encoded. Node's
 * `encodeURIComponent` leaves `!*'()` alone; we need to escape those.
 */
function uriEncodePath(path: string): string {
  // Preserve path separators, escape everything else segment by segment.
  return path
    .split("/")
    .map((seg) =>
      encodeURIComponent(seg).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

function uriEncodeQueryValue(val: string): string {
  return encodeURIComponent(val).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQueryString(
  params: Record<string, string | string[] | undefined>,
): string {
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) entries.push([k, item]);
    } else {
      entries.push([k, v]);
    }
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries
    .map(
      ([k, v]) => `${uriEncodeQueryValue(k)}=${uriEncodeQueryValue(v)}`,
    )
    .join("&");
}

function iso8601Basic(d: Date): { amzDate: string; dateStamp: string } {
  const amzDate = d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export interface SignRequestInput {
  method: string;
  url: URL;
  headers: Record<string, string>;
  /** Raw request body for payload hashing. */
  body?: ArrayBuffer | Uint8Array | string;
  /** Skip payload hashing entirely (required for presigned URLs). */
  unsignedPayload?: boolean;
}

/**
 * Sign a request by adding Authorization + x-amz-* headers in place.
 * Returns the same headers object with signature filled in.
 */
export async function signRequest(
  creds: SigV4Credentials,
  input: SignRequestInput,
): Promise<Record<string, string>> {
  const now = new Date();
  const { amzDate, dateStamp } = iso8601Basic(now);

  const host = input.url.host;
  const headers: Record<string, string> = {
    ...input.headers,
    host,
    "x-amz-date": amzDate,
  };

  const payloadHash = input.unsignedPayload
    ? UNSIGNED_PAYLOAD
    : await sha256(input.body ?? "");
  headers["x-amz-content-sha256"] = payloadHash;

  const sortedHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders =
    sortedHeaderNames
      .map((name) => {
        const value = (headers[name] ?? headers[name.toLowerCase()] ?? "")
          .toString()
          .trim()
          .replace(/\s+/g, " ");
        return `${name}:${value}`;
      })
      .join("\n") + "\n";
  const signedHeaders = sortedHeaderNames.join(";");

  const query: Record<string, string> = {};
  for (const [k, v] of input.url.searchParams.entries()) {
    // SearchParams can legitimately have repeated keys; last-wins is fine
    // for our use cases (prefix, list-type, etc. are always unique).
    query[k] = v;
  }

  const canonicalRequest = [
    input.method.toUpperCase(),
    uriEncodePath(input.url.pathname || "/"),
    canonicalQueryString(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${creds.region}/${creds.service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const kSigning = await signingKey(
    creds.secretAccessKey,
    dateStamp,
    creds.region,
    creds.service,
  );
  const signature = toHex(await hmac(kSigning, stringToSign));

  headers.authorization =
    `${ALGORITHM} Credential=${creds.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

export interface PresignInput {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  url: URL;
  /** Headers that must participate in the signature (e.g. Content-Type on PUT). */
  signedHeaders?: Record<string, string>;
  expiresIn: number;
}

/**
 * Returns a pre-signed URL that embeds the signature in the query
 * string. Clients can fire this URL directly without any Authorization
 * header (except anything the caller chose to include in signedHeaders).
 */
export async function presignUrl(
  creds: SigV4Credentials,
  input: PresignInput,
): Promise<string> {
  const now = new Date();
  const { amzDate, dateStamp } = iso8601Basic(now);
  const credentialScope = `${dateStamp}/${creds.region}/${creds.service}/aws4_request`;

  const host = input.url.host;
  const extraSigned: Record<string, string> = {
    host,
    ...input.signedHeaders,
  };
  const sortedHeaderNames = Object.keys(extraSigned)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders =
    sortedHeaderNames
      .map((name) => {
        const val = (extraSigned[name] ?? extraSigned[name.toLowerCase()])
          ?.toString()
          .trim()
          .replace(/\s+/g, " ");
        return `${name}:${val ?? ""}`;
      })
      .join("\n") + "\n";
  const signedHeaders = sortedHeaderNames.join(";");

  // Add SigV4 query parameters (alphabetical order matters for the
  // canonical query string — buildCanonical sorts for us).
  const query: Record<string, string> = {};
  for (const [k, v] of input.url.searchParams.entries()) query[k] = v;
  query["X-Amz-Algorithm"] = ALGORITHM;
  query["X-Amz-Credential"] = `${creds.accessKeyId}/${credentialScope}`;
  query["X-Amz-Date"] = amzDate;
  query["X-Amz-Expires"] = Math.max(1, Math.floor(input.expiresIn)).toString();
  query["X-Amz-SignedHeaders"] = signedHeaders;

  const canonicalRequest = [
    input.method,
    uriEncodePath(input.url.pathname || "/"),
    canonicalQueryString(query),
    canonicalHeaders,
    signedHeaders,
    UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const kSigning = await signingKey(
    creds.secretAccessKey,
    dateStamp,
    creds.region,
    creds.service,
  );
  const signature = toHex(await hmac(kSigning, stringToSign));
  query["X-Amz-Signature"] = signature;

  const finalUrl = new URL(input.url.toString());
  finalUrl.search = "";
  const qs = canonicalQueryString(query);
  return `${finalUrl.toString()}${qs ? `?${qs}` : ""}`;
}
