// Re-export all schema modules. better-auth tables live in ./auth (generated
// by `pnpm auth:generate`). Add business tables in their own files and
// re-export them here so drizzle picks them up.
export * from "./auth";
