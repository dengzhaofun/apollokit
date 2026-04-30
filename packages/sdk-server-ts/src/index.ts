/**
 * `@apollokit/server` — TypeScript SDK for server-to-server calls.
 *
 * 30-second quickstart (full README in ../README.md):
 *
 *   import {
 *     createServerClient,
 *     AnnouncementAdminService,
 *   } from "@apollokit/server";
 *
 *   createServerClient({
 *     baseUrl: "https://api.example.com",
 *     apiKey: process.env.APOLLOKIT_ADMIN_KEY!, // "ak_…"
 *   });
 *
 *   const { data: envelope } = await AnnouncementAdminService
 *     .announcementAdminGetRoot({ throwOnError: true });
 *   const announcements = envelope.data; // typed AnnouncementList
 *
 * The bound `client` is configured globally by `createServerClient`,
 * so generated service classes can be imported and called directly. Pass
 * an explicit `client` option to a service method when you need multiple
 * isolated clients (e.g. one per tenant in a multi-tenant proxy).
 *
 * Generated SDK is class-based: one `XxxService` class per OpenAPI tag.
 * Adding a new tag on the server produces a new service class with no
 * SDK code changes required — re-run codegen and import the new class.
 */

export { createServerClient, client } from "./client.js";
export type { ApolloKitServerConfig } from "./client.js";

export {
  ApolloKitApiError,
  isApolloKitApiError,
  isErrorEnvelope,
} from "./errors.js";
export type { ApolloKitErrorEnvelope } from "./errors.js";

// Re-export every generated service class and type so callers get the
// full surface from a single import path. The list of services updates
// automatically when codegen runs against new OpenAPI tags.
export * from "./generated/types.gen.js";
export * from "./generated/sdk.gen.js";
