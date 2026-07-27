import { dbDeletePrWatch, dbGetPrWatch, dbGetPrWatches, dbUpsertPrWatch } from "../db";
import { PrWatchService, type PrWatchServiceOptions } from "./PrWatchService";

export type DevicePrWatchServiceOptions = Omit<PrWatchServiceOptions, "store">;

export function createDevicePrWatchService(options: DevicePrWatchServiceOptions): PrWatchService {
  return new PrWatchService({
    store: {
      list: dbGetPrWatches,
      get: dbGetPrWatch,
      upsert: dbUpsertPrWatch,
      delete: dbDeletePrWatch,
    },
    ...options,
  });
}

export { PrWatchService, type PrWatchServiceOptions, type PrWatchStore } from "./PrWatchService";
