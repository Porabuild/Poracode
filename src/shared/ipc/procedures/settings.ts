import { z } from "zod";
import type { AgentInstanceConfig, SetClaudeProfileEnvironmentPayload } from "../../contracts";
import { setClaudeProfileEnvironmentPayloadSchema } from "../../contracts";
import {
  MAX_CROSSAGENT_SELECTION_VALUE_LENGTH,
  type CrossagentRoutingOverride,
  type CrossagentSelectionUsageEntry,
  type SharedSettings,
  type SharedSettingsInput,
} from "../../settings";
import type { CrossagentSelectionUsageEntryKey } from "../../crossagentRanking";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";

/** Identity of one learned Crossagents memory entry (see crossagentRanking). */
const crossagentMemoryEntryKeySchema = z.object({
  agentKind: z.string().min(1).max(MAX_CROSSAGENT_SELECTION_VALUE_LENGTH),
  modelId: z.string().min(1).max(MAX_CROSSAGENT_SELECTION_VALUE_LENGTH),
  effort: z.string().min(1).max(MAX_CROSSAGENT_SELECTION_VALUE_LENGTH).optional(),
  fast: z.boolean(),
  tags: z.array(z.string().min(1).max(32)).max(5).optional(),
});
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
  // Learned-memory edits from the Crossagents settings UI. `crossagentSelectionUsage`
  // is supervisor-managed (renderer persists can't write it), so removals and tag
  // edits round-trip through main like `removeCrossagentRoutingOverride`.
  removeCrossagentMemoryEntry: definePayloadProcedure<
    { entry: CrossagentSelectionUsageEntryKey },
    CrossagentSelectionUsageEntry[],
    "main-local"
  >(
    "removeCrossagentMemoryEntry",
    "main-local",
    z.object({ entry: crossagentMemoryEntryKeySchema }),
  ),
  updateCrossagentMemoryEntryTags: definePayloadProcedure<
    { entry: CrossagentSelectionUsageEntryKey; tags: string[] },
    CrossagentSelectionUsageEntry[],
    "main-local"
  >(
    "updateCrossagentMemoryEntryTags",
    "main-local",
    z.object({
      entry: crossagentMemoryEntryKeySchema,
      tags: z.array(z.string().min(1).max(32)).max(5),
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
