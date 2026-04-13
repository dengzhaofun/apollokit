/**
 * Client credentials module barrel.
 *
 * Wires the service factory to the deps singleton and re-exports
 * everything routes / other modules need.
 */

import { deps } from "../../deps";
import { createClientCredentialService } from "./service";

export { createClientCredentialService };
export type { ClientCredentialService } from "./service";
export const clientCredentialService = createClientCredentialService(deps);
export { clientCredentialRouter } from "./routes";
