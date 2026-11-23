import {
  manageModelProvidersPayloadSchema,
  manageModelProvidersResultSchema,
  type ManageModelProvidersPayload,
  type ManageModelProvidersResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const modelProviderProcedures = {
  manageModelProviders: definePayloadProcedure<
    ManageModelProvidersPayload,
    ManageModelProvidersResult,
    "supervisor"
  >(
    "manageModelProviders",
    "supervisor",
    manageModelProvidersPayloadSchema,
    manageModelProvidersResultSchema,
  ),
} as const;
