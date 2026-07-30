import { z } from "zod";
import type { AgentInstanceConfig, SetClaudeProfileEnvironmentPayload } from "../../contracts";
import { setClaudeProfileEnvironmentPayloadSchema } from "../../contracts";
import {
  type CrossagentRoutingOverride,
  type SharedSettings,
  type SharedSettingsInput,
} from "../../settings";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";
import {
  windowChromePayloadSchema,
  type WindowChromePayload,
  type WindowChromeResult,
} from "../schemas";

export const settingsProcedures = {
  getSharedSettings: defineNoArgProcedure<SharedSettings, "main-local">(
    "getSharedSettings",
    "main-local",
  ),
  setSharedSettings: definePayloadProcedure<SharedSettingsInput, void, "main-local">(
    "setSharedSettings",
    "main-local",
    z.custom<SharedSettingsInput>(),
  ),
  setAgentSecretSetting: definePayloadProcedure<
    { agentKind: string; key: string; value: string },
    { storedValue: string | null },
    "main-local"
  >(
    "setAgentSecretSetting",
    "main-local",
    z.object({
      agentKind: z.string().min(1).max(64),
      key: z.string().min(1).max(120),
      value: z.string().max(16_384),
    }),
  ),
  removeCrossagentRoutingOverride: definePayloadProcedure<
    { tags: string[] },
    CrossagentRoutingOverride[],
    "main-local"
  >(
    "removeCrossagentRoutingOverride",
    "main-local",
    z.object({
      tags: z.array(z.string().min(1).max(32)).min(1).max(5),
    }),
  ),
  // Seals sensitive vars in main before writing settings.json, so a profile's
  // ANTHROPIC_AUTH_TOKEN never lands in plaintext via the renderer persist
  // cycle. Returns the updated instance (env sealed) for the store to adopt.
  setClaudeProfileEnvironment: definePayloadProcedure<
    SetClaudeProfileEnvironmentPayload,
    AgentInstanceConfig,
    "main-local"
  >("setClaudeProfileEnvironment", "main-local", setClaudeProfileEnvironmentPayloadSchema),
  setWindowChrome: definePayloadProcedure<
    WindowChromePayload,
    WindowChromeResult | void,
    "main-local"
  >("setWindowChrome", "main-local", windowChromePayloadSchema),
} as const;
