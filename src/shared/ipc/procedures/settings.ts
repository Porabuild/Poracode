import { z } from "zod";
import type {
  AgentInstanceConfig,
  CreateProfilePayload,
  SetProfileEnvironmentPayload,
} from "../../contracts";
import { createProfilePayloadSchema, setProfileEnvironmentPayloadSchema } from "../../contracts";
import {
  type CrossagentRoutingOverride,
  type CrossagentSelectionUsageEntry,
  type CrossagentSelectionUsageEntryKey,
  crossagentSelectionUsageEntryKeySchema,
  type SharedSettings,
  type SharedSettingsInput,
} from "../../settings";
import {
  settingsMutationResultSchema,
  settingsMutationSchema,
  settingsSnapshotSchema,
  type SettingsMutation,
  type SettingsMutationResult,
  type SettingsSnapshot,
} from "../../settingsTransactions";
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
  // Authority-native transaction surface. `settingsTransactionMutate` applies
  // revision-checked scoped edits (stale revisions return an explicit conflict,
  // never a silent last-writer-wins overwrite); `settingsTransactionSnapshot`
  // returns the committed document with per-subject revisions. Both are served
  // by the composition's `SettingsCommandService` in desktop and headless
  // hosts. `setSharedSettings` remains as the compat adapter for clients that
  // still speak whole snapshots.
  settingsTransactionMutate: definePayloadProcedure<
    SettingsMutation,
    SettingsMutationResult,
    "main-local"
  >(
    "settingsTransactionMutate",
    "main-local",
    settingsMutationSchema,
    settingsMutationResultSchema,
  ),
  settingsTransactionSnapshot: defineNoArgProcedure<SettingsSnapshot, "main-local">(
    "settingsTransactionSnapshot",
    "main-local",
    settingsSnapshotSchema,
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
  // edits round-trip to the backend like `removeCrossagentRoutingOverride`.
  removeCrossagentMemoryEntry: definePayloadProcedure<
    { entry: CrossagentSelectionUsageEntryKey },
    CrossagentSelectionUsageEntry[],
    "main-local"
  >(
    "removeCrossagentMemoryEntry",
    "main-local",
    z.object({ entry: crossagentSelectionUsageEntryKeySchema }),
  ),
  updateCrossagentMemoryEntryTags: definePayloadProcedure<
    { entry: CrossagentSelectionUsageEntryKey; tags: string[] },
    CrossagentSelectionUsageEntry[],
    "main-local"
  >(
    "updateCrossagentMemoryEntryTags",
    "main-local",
    z.object({
      entry: crossagentSelectionUsageEntryKeySchema,
      tags: z.array(z.string().min(1).max(32)).max(5),
    }),
  ),
  // Seals sensitive vars in the backend before writing settings.json, so a profile's
  // ANTHROPIC_AUTH_TOKEN never lands in plaintext via the renderer persist
  // cycle. Returns the updated instance (env sealed) for the store to adopt.
  // One encrypting write path for every multi-profile provider; the driver
  // comes from the instance (or the payload on create), never from the name.
  setProfileEnvironment: definePayloadProcedure<
    SetProfileEnvironmentPayload,
    AgentInstanceConfig,
    "main-local"
  >("setProfileEnvironment", "main-local", setProfileEnvironmentPayloadSchema),
  createProfile: definePayloadProcedure<CreateProfilePayload, AgentInstanceConfig, "main-local">(
    "createProfile",
    "main-local",
    createProfilePayloadSchema,
  ),
  setWindowChrome: definePayloadProcedure<
    WindowChromePayload,
    WindowChromeResult | void,
    "main-local"
  >("setWindowChrome", "main-local", windowChromePayloadSchema),
} as const;
