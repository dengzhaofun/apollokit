/**
 * Smoke example for `@apollokit/server` — type-check only.
 *
 * Run target: not for `node` execution (we don't want to thread real
 * `ak_` keys through CI). Instead this file is included in `tsc`'s
 * input so `pnpm check-types` verifies the wrapper types align with
 * the generated SDK functions end-to-end. If a server route changes
 * its response schema and the SDK isn't regenerated, this fails to
 * typecheck.
 *
 * Note on `data[200]`: hey-api's generated `Responses` type is a
 * status-code-indexed map, so the success envelope is reached via
 * `result.data[200]`. With `throwOnError: true`, runtime guarantees
 * 2xx, so the `[200]` access is sound.
 */

import {
  ApolloKitApiError,
  announcementAdminGetRoot,
  badgeAdminGetNodes,
  checkInGetConfigs,
  createServerClient,
  isErrorEnvelope,
} from "@apollokit/server";

async function demo() {
  // 1. Init: bound `client` is now configured with baseUrl + x-api-key.
  createServerClient({
    baseUrl: "https://api.example.com",
    apiKey: "ak_smoke_example_not_a_real_key",
  });

  // 2. With `throwOnError: true`, success returns envelope at data[200];
  //    4xx/5xx throw the raw `error` envelope. Caller pulls payload
  //    from `.data.data`.
  const { data: announcementsRes } = await announcementAdminGetRoot({
    throwOnError: true,
  });
  const announcements = announcementsRes[200].data;
  console.log(`announcement count: ${announcements.items.length}`);

  const { data: badgesRes } = await badgeAdminGetNodes({ throwOnError: true });
  const badges = badgesRes[200].data;
  console.log(`badge nodes: ${badges.items.length}`);

  // 3. Manual error handling — call without `throwOnError`, narrow on
  //    the success envelope, optionally rethrow as ApolloKitApiError.
  const { data, error, response } = await checkInGetConfigs({});
  if (error && isErrorEnvelope(error)) {
    throw new ApolloKitApiError(error, response.status);
  }
  if (data && data[200]?.code === "ok") {
    console.log(`check-in configs: ${data[200].data.items.length}`);
  }
}

// Avoid "unused export" — ensure the demo is reachable from typecheck.
export { demo };
