import {
  prWatchAgentSyncSchema,
  prWatchInputSchema,
  prWatchKeySchema,
  type PrWatch,
  type PrWatchAgentSync,
  type PrWatchInput,
  type PrWatchKey,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const prWatchProcedures = {
  getPrWatch: definePayloadProcedure<PrWatchKey, PrWatch | null, "main-local">(
    "getPrWatch",
    "main-local",
    prWatchKeySchema,
  ),
  checkPrWatch: definePayloadProcedure<PrWatchKey, void, "main-local">(
    "checkPrWatch",
    "main-local",
    prWatchKeySchema,
  ),
  upsertPrWatch: definePayloadProcedure<PrWatchInput, PrWatch, "main-local">(
    "upsertPrWatch",
    "main-local",
    prWatchInputSchema,
  ),
  deletePrWatch: definePayloadProcedure<PrWatchKey, void, "main-local">(
    "deletePrWatch",
    "main-local",
    prWatchKeySchema,
  ),
  syncPrWatchAgent: definePayloadProcedure<PrWatchAgentSync, void, "main-local">(
    "syncPrWatchAgent",
    "main-local",
    prWatchAgentSyncSchema,
  ),
} as const;
