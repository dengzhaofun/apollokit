import { deps } from "../../deps";
import { createCharacterService } from "./service";

export { createCharacterService };
export type { CharacterService } from "./service";
export const characterService = createCharacterService(deps);
export { characterRouter } from "./routes";
