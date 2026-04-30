/**
 * Public surface of `@repo/admin-agent-ui`.
 *
 * Two import paths:
 *   - `@repo/admin-agent-ui/catalog` — server-safe (no React deps).
 *     Imports the spec zod schema for tool input definitions.
 *   - `@repo/admin-agent-ui/registry` — client-only React renderer +
 *     `<AdminAgentUI>` convenience component.
 *
 * Most callers can import everything from the root path; tree-shake
 * will drop the registry on the server side as long as it's not
 * referenced (verify with bundle inspection if you add server tools
 * that emit specs).
 */

export {
  catalog,
  specSchema,
  type AdminAgentUISpec,
  type AdminAgentActionName,
} from "./catalog.js";

export { registry, Renderer, AdminAgentUI } from "./registry.js";
