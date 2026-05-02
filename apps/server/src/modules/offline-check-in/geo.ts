/**
 * Geo helpers — pure, no deps.
 *
 * Workers / Neon path doesn't have PostGIS, and we don't need it for a
 * "is the player within R meters of this spot" check. Haversine over
 * a sphere is accurate to ~0.5% at city scale, which is plenty better
 * than the ~10–50 m typical accuracy of a phone's Geolocation API.
 *
 * Inputs:
 *   - latitude / longitude in WGS84 decimal degrees (Geolocation API
 *     and Apple/Google Maps conventions).
 * Output:
 *   - distance in meters (Earth radius constant: 6,371,008.8m, the
 *     IUGG mean radius — same value used by PostGIS / GeographicLib).
 */

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two lat/lng points in meters.
 *
 * `lat`/`lng` are in WGS84 decimal degrees. Result is non-negative.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Sanity check on a lat/lng pair. Returns false for NaN, infinities,
 * out-of-range values. Used by validators and the verifier — both layers
 * benefit from rejecting nonsense before doing math on it.
 */
export function isValidLatLng(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}
