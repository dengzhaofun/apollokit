import { deps } from "../../deps";
import { currencyService } from "../currency";
import { createStorageBoxService } from "./service";

export { createStorageBoxService };
export type { StorageBoxService } from "./service";
export const storageBoxService = createStorageBoxService(
  deps,
  currencyService,
);
export { storageBoxRouter } from "./routes";
