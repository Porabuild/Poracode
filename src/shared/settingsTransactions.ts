import { z } from "zod";
import { sharedSettingsSchema } from "./settings";

/** The settings transaction vocabulary is independent of transport framing. */
export const SETTINGS_TRANSACTION_VERSION = 1 as const;
export const SETTINGS_MISSING_REVISION = "missing" as const;
/** Initial admission ceilings, not measured throughput or latency budgets. */
export const DEFAULT_SETTINGS_ADMISSION_LIMITS = {
  maxPendingTransactions: 128,
  maxPendingBytes: 4 * 1024 * 1024,
  maxTransactionBytes: 1024 * 1024,
} as const;
export interface SettingsAdmissionLimits {
  maxPendingTransactions: number;
  maxPendingBytes: number;
  maxTransactionBytes: number;
}

export const SETTINGS_ENTRY_FIELDS = [
  "machineSettings",
  "hiddenModels",
  "acpRegistryInstalledAgents",
  "agentInstances",
  "providerConfigs",
  "providerModelPreferences",
  "lastPresentationModeByAgent",
  "crossagentHiddenModels",
  "dismissedHookInstallProposals",
  "agentHookSupport",
  "enabledMcpServers",
  "disabledBuiltInMcpServers",
  "disabledBuiltInMcpTools",
  "installedPlugins",
  "browser",
  "audio",
  "usage",
  "machineScopeModes",
  "sidebarGlassTint",
] as const;
export const SETTINGS_LIST_FIELDS = [
  "mcpServers",
  "workspaces",
  "crossagentRoutingOverrides",
  "crossagentSelectionUsage",
] as const;

const entryKeySchema = z
  .string()
  .min(1)
  .refine(
    (key) => !["__proto__", "prototype", "constructor"].includes(key),
    "Reserved settings entry key",
  );
export const settingsSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field"), field: sharedSettingsSchema.keyof() }).strict(),
  z
    .object({ kind: z.literal("entry"), field: z.enum(SETTINGS_ENTRY_FIELDS), key: entryKeySchema })
    .strict(),
  z
    .object({ kind: z.literal("agent-setting"), agentKind: entryKeySchema, key: entryKeySchema })
    .strict(),
  z
    .object({
      kind: z.literal("list-entry"),
      field: z.enum(SETTINGS_LIST_FIELDS),
      key: entryKeySchema,
    })
    .strict(),
]);
export type SettingsSubject = z.infer<typeof settingsSubjectSchema>;

export const settingsRevisionSchema = z.union([
  z.literal(SETTINGS_MISSING_REVISION),
  z.string().regex(/^s1:[a-f0-9]{64}$/),
]);
export const settingsEditSchema = z.discriminatedUnion("operation", [
  z
    .object({
      subject: settingsSubjectSchema,
      expectedRevision: settingsRevisionSchema,
      operation: z.literal("set"),
      value: z.json(),
    })
    .strict(),
  z
    .object({
      subject: settingsSubjectSchema,
      expectedRevision: settingsRevisionSchema,
      operation: z.literal("delete"),
    })
    .strict(),
]);
export type SettingsEdit = z.infer<typeof settingsEditSchema>;

export const settingsMutationSchema = z
  .object({
    version: z.literal(SETTINGS_TRANSACTION_VERSION),
    authorityId: z.string().uuid(),
    edits: z.array(settingsEditSchema).min(1).max(256),
  })
  .strict();
export type SettingsMutation = z.infer<typeof settingsMutationSchema>;

export const settingsSubjectStateSchema = z
  .object({
    subject: settingsSubjectSchema,
    revision: settingsRevisionSchema,
    value: z.json().optional(),
  })
  .strict();
export type SettingsSubjectState = z.infer<typeof settingsSubjectStateSchema>;
export const settingsMutationResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("committed"),
      authorityId: z.string().uuid(),
      sequence: z.number().int().nonnegative(),
      changes: z.array(settingsSubjectStateSchema),
      revisions: z.record(z.string(), settingsRevisionSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal("conflict"),
      authorityId: z.string().uuid(),
      sequence: z.number().int().nonnegative(),
      reason: z.enum(["authority-changed", "revision-changed"]),
      current: z.array(settingsSubjectStateSchema),
      revisions: z.record(z.string(), settingsRevisionSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal("overloaded"),
      authorityId: z.string().uuid(),
      sequence: z.number().int().nonnegative(),
      reason: z.enum(["request-too-large", "queue-full"]),
    })
    .strict(),
]);
export type SettingsMutationResult = z.infer<typeof settingsMutationResultSchema>;

export const settingsSnapshotSchema = z.object({
  authorityId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  settings: sharedSettingsSchema,
  revisions: z.record(z.string(), settingsRevisionSchema),
});
export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>;

/** Stable map key; revisions cannot be used as chronological sequence numbers. */
export function settingsSubjectId(subject: SettingsSubject): string {
  return subject.kind === "agent-setting"
    ? JSON.stringify([subject.kind, subject.agentKind, subject.key])
    : JSON.stringify([
        subject.kind,
        subject.field,
        ...(subject.kind === "field" ? [] : [subject.key]),
      ]);
}

export function settingsSubjectField(
  subject: SettingsSubject,
): keyof z.infer<typeof sharedSettingsSchema> {
  return subject.kind === "agent-setting" ? "agentSettings" : subject.field;
}
