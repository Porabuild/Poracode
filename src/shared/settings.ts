import { z } from "zod";
import { terminalPositionSchema, themeModeSchema } from "./contracts";

export const sharedSettingsSchema = z.object({
  themeMode: themeModeSchema,
  terminalPosition: terminalPositionSchema,
  commitGenProvider: z.string(),
  commitGenModel: z.string(),
  commitGenEffort: z.string(),
  titleGenProvider: z.string(),
  titleGenModel: z.string(),
  titleGenEffort: z.string(),
  conflictResolverProvider: z.string(),
  conflictResolverModel: z.string(),
  conflictResolverEffort: z.string(),
  wslCommitGenProvider: z.string(),
  wslCommitGenModel: z.string(),
  wslCommitGenEffort: z.string(),
  wslTitleGenProvider: z.string(),
  wslTitleGenModel: z.string(),
  wslTitleGenEffort: z.string(),
  wslConflictResolverProvider: z.string(),
  wslConflictResolverModel: z.string(),
  wslConflictResolverEffort: z.string(),
  /** Per-agent boolean settings keyed by agent kind, then setting key. */
  agentSettings: z.record(z.string(), z.record(z.string(), z.boolean())),
  /** When true, the composer in terminal-native threads starts collapsed. */
  collapseTerminalComposer: z.boolean(),
  /** Idle minutes before a hidden resumable thread is unloaded. 0 disables auto-unload. */
  staleThreadUnloadMinutes: z.number().int().min(0),
});
export type SharedSettings = z.infer<typeof sharedSettingsSchema>;

export const defaultSharedSettings: SharedSettings = {
  themeMode: "system",
  terminalPosition: "right",
  commitGenProvider: "auto",
  commitGenModel: "",
  commitGenEffort: "",
  titleGenProvider: "auto",
  titleGenModel: "",
  titleGenEffort: "",
  conflictResolverProvider: "auto",
  conflictResolverModel: "",
  conflictResolverEffort: "",
  wslCommitGenProvider: "auto",
  wslCommitGenModel: "",
  wslCommitGenEffort: "",
  wslTitleGenProvider: "auto",
  wslTitleGenModel: "",
  wslTitleGenEffort: "",
  wslConflictResolverProvider: "auto",
  wslConflictResolverModel: "",
  wslConflictResolverEffort: "",
  agentSettings: {},
  collapseTerminalComposer: false,
  staleThreadUnloadMinutes: 20,
};

const partialSharedSettingsSchema = sharedSettingsSchema.partial();

export function normalizeSharedSettings(value: unknown): SharedSettings {
  const parsed = partialSharedSettingsSchema.safeParse(value);
  if (!parsed.success) {
    return { ...defaultSharedSettings };
  }

  return {
    themeMode: parsed.data.themeMode ?? defaultSharedSettings.themeMode,
    terminalPosition: parsed.data.terminalPosition ?? defaultSharedSettings.terminalPosition,
    commitGenProvider: parsed.data.commitGenProvider ?? defaultSharedSettings.commitGenProvider,
    commitGenModel: parsed.data.commitGenModel ?? defaultSharedSettings.commitGenModel,
    commitGenEffort: parsed.data.commitGenEffort ?? defaultSharedSettings.commitGenEffort,
    titleGenProvider: parsed.data.titleGenProvider ?? defaultSharedSettings.titleGenProvider,
    titleGenModel: parsed.data.titleGenModel ?? defaultSharedSettings.titleGenModel,
    titleGenEffort: parsed.data.titleGenEffort ?? defaultSharedSettings.titleGenEffort,
    conflictResolverProvider:
      parsed.data.conflictResolverProvider ?? defaultSharedSettings.conflictResolverProvider,
    conflictResolverModel:
      parsed.data.conflictResolverModel ?? defaultSharedSettings.conflictResolverModel,
    conflictResolverEffort:
      parsed.data.conflictResolverEffort ?? defaultSharedSettings.conflictResolverEffort,
    wslCommitGenProvider:
      parsed.data.wslCommitGenProvider ?? defaultSharedSettings.wslCommitGenProvider,
    wslCommitGenModel: parsed.data.wslCommitGenModel ?? defaultSharedSettings.wslCommitGenModel,
    wslCommitGenEffort: parsed.data.wslCommitGenEffort ?? defaultSharedSettings.wslCommitGenEffort,
    wslTitleGenProvider:
      parsed.data.wslTitleGenProvider ?? defaultSharedSettings.wslTitleGenProvider,
    wslTitleGenModel: parsed.data.wslTitleGenModel ?? defaultSharedSettings.wslTitleGenModel,
    wslTitleGenEffort: parsed.data.wslTitleGenEffort ?? defaultSharedSettings.wslTitleGenEffort,
    wslConflictResolverProvider:
      parsed.data.wslConflictResolverProvider ?? defaultSharedSettings.wslConflictResolverProvider,
    wslConflictResolverModel:
      parsed.data.wslConflictResolverModel ?? defaultSharedSettings.wslConflictResolverModel,
    wslConflictResolverEffort:
      parsed.data.wslConflictResolverEffort ?? defaultSharedSettings.wslConflictResolverEffort,
    agentSettings: parsed.data.agentSettings ?? defaultSharedSettings.agentSettings,
    collapseTerminalComposer:
      parsed.data.collapseTerminalComposer ?? defaultSharedSettings.collapseTerminalComposer,
    staleThreadUnloadMinutes:
      parsed.data.staleThreadUnloadMinutes ?? defaultSharedSettings.staleThreadUnloadMinutes,
  };
}
