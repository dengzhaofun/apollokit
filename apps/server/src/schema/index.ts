// Re-export all schema modules. better-auth tables live in ./auth (generated
// by `pnpm auth:generate`). Add business tables in their own files and
// re-export them here so drizzle picks them up.
export * from "./announcement";
export * from "./auth";
export * from "./banner";
export * from "./cdkey";
export * from "./check-in";
export * from "./client-credential";
export * from "./collection";
export * from "./currency";
export * from "./dialogue";
export * from "./exchange";
export * from "./item";
export * from "./invite";
export * from "./lottery";
export * from "./mail";
export * from "./shop";
export * from "./friend";
export * from "./guild";
export * from "./team";
export * from "./friend-gift";
export * from "./entity";
export * from "./level";
export * from "./task";
export * from "./leaderboard";
export * from "./activity";
export * from "./storage-box";
export * from "./media-library";
export * from "./event-catalog";
