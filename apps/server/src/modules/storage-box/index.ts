import { deps } from "../../deps";
import { itemService } from "../item";
import { createStorageBoxService } from "./service";

export { createStorageBoxService };
export type { StorageBoxService } from "./service";
export const storageBoxService = createStorageBoxService(deps, itemService);
export { storageBoxRouter } from "./routes";
