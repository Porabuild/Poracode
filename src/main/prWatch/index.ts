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

export {
  PrWatchService,
  type PrWatchAgent,
  type PrWatchServiceOptions,
  type PrWatchStore,
  type PrWatchWorkContext,
} from "./PrWatchService";
export { buildPrWatchExecutionDeps, type PrWatchExecutionParams } from "./watchExecution";
