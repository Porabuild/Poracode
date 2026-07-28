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
