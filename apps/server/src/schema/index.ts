// Re-export all schema modules. better-auth tables live in ./auth (generated
// by `pnpm auth:generate`). Add business tables in their own files and
// re-export them here so drizzle picks them up.
export * from "./auth";
export * from "./check-in";
export * from "./client-credential";
export * from "./exchange";
export * from "./item";
export * from "./lottery";
export * from "./mail";
