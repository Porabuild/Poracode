import {
  dbAdmitPrWatchExecution,
  dbReadPrWatchExecutionSnapshot,
} from "@/host/db/prWatchExecutionAdmission";
import {
  dbDeletePrWatch,
  dbGetPrWatch,
  dbGetPrWatches,
  dbPatchPrWatchRuntime,
  dbUpsertPrWatch,
} from "@/host/db";
import { PrWatchService, type PrWatchServiceOptions } from "./PrWatchService";

export type DevicePrWatchServiceOptions = Omit<PrWatchServiceOptions, "store">;

export function createDevicePrWatchService(options: DevicePrWatchServiceOptions): PrWatchService {
  return new PrWatchService({
    store: {
      list: dbGetPrWatches,
      get: dbGetPrWatch,
      upsert: dbUpsertPrWatch,
      delete: dbDeletePrWatch,
      readExecutionSnapshot: dbReadPrWatchExecutionSnapshot,
      admitExecution: (captured) =>
        dbAdmitPrWatchExecution(captured.projectId, captured.prNumber, captured),
      patchRuntime: dbPatchPrWatchRuntime,
    },
    ...options,
  });
}

export {
  PrWatchService,
  type PrWatchAgent,
  type PrWatchAssertCurrent,
  type PrWatchLaunchOptions,
  type PrWatchServiceOptions,
  type PrWatchStore,
  type PrWatchWorkContext,
} from "./PrWatchService";
export { buildPrWatchExecutionDeps, type PrWatchExecutionParams } from "./watchExecution";
