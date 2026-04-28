/**
 * `@apollokit/server` — TypeScript SDK for server-to-server calls.
 *
 * 30-second quickstart (full README in ../README.md):
 *
 *   import {
 *     createServerClient,
 *     announcementAdminGetRoot,
 *   } from "@apollokit/server";
 *
 *   createServerClient({
 *     baseUrl: "https://api.example.com",
 *     apiKey: process.env.APOLLOKIT_ADMIN_KEY!, // "ak_…"
 *   });
 *
 *   const { data: envelope } = await announcementAdminGetRoot({
 *     throwOnError: true,
 *   });
 *   const announcements = envelope.data; // typed AnnouncementList
 *
 * The bound `client` is configured globally by `createServerClient`,
 * so generated functions can be imported and called directly. Pass an
 * explicit `client` option when you need multiple isolated clients
 * (e.g. one per tenant in a multi-tenant proxy).
 */

export { createServerClient, client } from "./client.js";
export type { ApolloKitServerConfig } from "./client.js";
export { ApolloKitApiError, isErrorEnvelope } from "./errors.js";
export type { ApolloKitErrorEnvelope } from "./errors.js";

// Re-export every generated function and type so callers get the full
// surface from a single import path.
export * from "./generated/types.gen.js";
export * from "./generated/sdk.gen.js";
