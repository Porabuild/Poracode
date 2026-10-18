import {
  manageModelProvidersPayloadSchema,
  type ManageModelProvidersPayload,
  type ManageModelProvidersResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const modelProviderProcedures = {
  manageModelProviders: definePayloadProcedure<
    ManageModelProvidersPayload,
    ManageModelProvidersResult,
    "supervisor"
  >("manageModelProviders", "supervisor", manageModelProvidersPayloadSchema),
} as const;
