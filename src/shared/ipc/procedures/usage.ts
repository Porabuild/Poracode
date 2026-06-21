import {
  providerUsagePayloadSchema,
  usageApiKeyPayloadSchema,
  usageLoginConfirmationPayloadSchema,
  usageLoginPayloadSchema,
  usageLoginStatePayloadSchema,
  type ProviderUsagePayload,
  type ProviderUsageResponse,
  type UsageApiKeyPayload,
  type UsageLoginConfirmationPayload,
  type UsageLoginPayload,
  type UsageLoginResult,
  type UsageLoginStatePayload,
  type UsageLoginStateResponse,
  type UsageLogoutResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const usageProcedures = {
  startUsageLogin: definePayloadProcedure<UsageLoginPayload, UsageLoginResult, "main-local">(
    "startUsageLogin",
    "main-local",
    usageLoginPayloadSchema,
  ),
  cancelUsageLogin: definePayloadProcedure<UsageLoginPayload, void, "main-local">(
    "cancelUsageLogin",
    "main-local",
    usageLoginPayloadSchema,
  ),
  clearUsageLogin: definePayloadProcedure<UsageLoginPayload, UsageLogoutResult, "main-local">(
    "clearUsageLogin",
    "main-local",
    usageLoginPayloadSchema,
  ),
  submitUsageApiKey: definePayloadProcedure<UsageApiKeyPayload, UsageLoginResult, "main-local">(
    "submitUsageApiKey",
    "main-local",
    usageApiKeyPayloadSchema,
  ),
  resolveUsageLoginConfirmation: definePayloadProcedure<
    UsageLoginConfirmationPayload,
    void,
    "main-local"
  >("resolveUsageLoginConfirmation", "main-local", usageLoginConfirmationPayloadSchema),
  getUsageLoginState: definePayloadProcedure<
    UsageLoginStatePayload,
    UsageLoginStateResponse,
    "main-local"
  >("getUsageLoginState", "main-local", usageLoginStatePayloadSchema),
  getProviderUsage: definePayloadProcedure<
    ProviderUsagePayload,
    ProviderUsageResponse,
    "supervisor"
  >("getProviderUsage", "supervisor", providerUsagePayloadSchema),
  refreshProviderUsage: definePayloadProcedure<
    ProviderUsagePayload,
    ProviderUsageResponse,
    "supervisor"
  >("refreshProviderUsage", "supervisor", providerUsagePayloadSchema),
} as const;
