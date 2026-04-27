/**
 * ID-vs-alias key discriminator. Used by every module that exposes both
 * a UUID `id` and a tenant-chosen `alias` on the same path param — the
 * caller picks which column to filter on based on the shape of the key.
 */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}
