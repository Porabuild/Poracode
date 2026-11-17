import { z } from "zod";
import { agentKindSchema, projectLocationSchema } from "./contracts/common";
import { modelSelectionSchema } from "./selectionBinding.schemas";

/**
 * Poracode memory settings & contracts. Settings live in the shared settings
 * file (per-field normalized with opt-in `enabled: false` by default). Memory
 * rows live in SQLite migrations 76–77, which older builds refuse because the
 * schema version moved forward. No settings-document version bump: missing
 * fields default safely via per-field normalization.
 */
export const memoryCaptureTimingSchema = z.enum(["settle-2m", "settle-90s", "custom", "lifecycle"]);
export type MemoryCaptureTiming = z.infer<typeof memoryCaptureTimingSchema>;

export const memoryDeletePolicySchema = z.enum(["spool", "lifecycle", "never"]);
export type MemoryDeletePolicy = z.infer<typeof memoryDeletePolicySchema>;

export const memoryDreamCadenceSchema = z.enum(["daily", "3d", "weekly", "manual"]);
export type MemoryDreamCadence = z.infer<typeof memoryDreamCadenceSchema>;

export const memorySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  learning: z.boolean().default(true),
  syncEnabled: z.boolean().default(true),
  captureTiming: memoryCaptureTimingSchema.default("settle-2m"),
  captureCustomMinutes: z.number().int().min(1).max(240).default(10),
  deletePolicy: memoryDeletePolicySchema.default("spool"),
  dreamCadence: memoryDreamCadenceSchema.default("daily"),
  suggestSkills: z.boolean().default(true),
  skillThreshold: z.number().int().min(2).max(20).default(3),
  sessionTokenBudget: z.number().int().min(200).max(8000).default(2000),
  archiveUnusedDays: z.number().int().min(0).max(3650).default(60),
  suppressNative: z.boolean().default(false),
  captureProvider: z.string().default("auto"),
  captureModel: z.string().default(""),
  captureEffort: z.string().default(""),
  captureFast: z.boolean().default(false),
  dreamProvider: z.string().default("auto"),
  dreamModel: z.string().default(""),
  dreamEffort: z.string().default(""),
  dreamFast: z.boolean().default(false),
});
export type MemorySettings = z.infer<typeof memorySettingsSchema>;

export const defaultMemorySettings: MemorySettings = memorySettingsSchema.parse({});

export const memoryScopeSchema = z.enum(["global", "project"]);
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const memoryCategorySchema = z.enum(["user", "feedback", "project", "reference"]);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export const memoryPolaritySchema = z.enum(["positive", "negative", "fact"]);
export type MemoryPolarity = z.infer<typeof memoryPolaritySchema>;

export const memoryThreadModeSchema = z.enum(["learn", "recall", "incognito"]);
export type MemoryThreadMode = z.infer<typeof memoryThreadModeSchema>;

export const memoryEntrySchema = z.object({
  id: z.string().min(1),
  scope: memoryScopeSchema,
  projectId: z.string().min(1).nullable(),
  repoKey: z.string().min(1).nullable().optional(),
  category: memoryCategorySchema,
  summary: z.string().min(1),
  body: z.string(),
  confidence: z.number().min(0).max(1),
  polarity: memoryPolaritySchema,
  quote: z.string().nullable(),
  lockedByUser: z.boolean(),
  pinned: z.boolean(),
  archived: z.boolean(),
  usageCount: z.number().int().nonnegative(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  source: z.enum(["learned", "user", "import", "dream"]),
});
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;

export const memorySkillSuggestionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  name: z.string().min(1),
  description: z.string(),
  body: z.string(),
  scope: memoryScopeSchema,
  availability: z.enum(["shared", "poracode"]),
  why: z.string(),
  status: z.enum(["suggested", "dismissed", "approved"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type MemorySkillSuggestion = z.infer<typeof memorySkillSuggestionSchema>;

export const memoryTombstoneSchema = z.object({
  id: z.string().min(1),
  scope: memoryScopeSchema,
  projectId: z.string().min(1).nullable(),
  repoKey: z.string().min(1).nullable().optional(),
  deletedAt: z.string().min(1),
});
export type MemoryTombstone = z.infer<typeof memoryTombstoneSchema>;

export const memorySyncStateSchema = z.object({
  entries: z.array(memoryEntrySchema),
  tombstones: z.array(memoryTombstoneSchema),
});
export type MemorySyncState = z.infer<typeof memorySyncStateSchema>;

export const memorySyncResponseSchema = z.object({
  synced: z.boolean(),
  state: memorySyncStateSchema,
});
export type MemorySyncResponse = z.infer<typeof memorySyncResponseSchema>;

export const memoryStatusSchema = z.object({
  enabled: z.boolean(),
  learning: z.boolean(),
  syncEnabled: z.boolean(),
  captureTiming: memoryCaptureTimingSchema,
  pendingCandidates: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  suggestionCount: z.number().int().nonnegative(),
  lastDreamAt: z.string().nullable(),
  lastDreamSummary: z.string().nullable(),
  lastDreamRunId: z.string().nullable().optional(),
  lastDreamCounts: z
    .object({
      promoted: z.number().int().nonnegative(),
      suggested: z.number().int().nonnegative(),
      retired: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  threadMode: memoryThreadModeSchema.nullable(),
});
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export const memoryCommandPayloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    threadId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("list"),
    projectId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("save"),
    entry: memoryEntrySchema
      .pick({
        scope: true,
        category: true,
        summary: true,
        body: true,
        polarity: true,
        pinned: true,
      })
      .extend({
        id: z.string().min(1).optional(),
        projectId: z.string().min(1).nullable().optional(),
        repoKey: z.string().min(1).nullable().optional(),
        quote: z.string().nullable().optional(),
      }),
  }),
  z.object({ action: z.literal("delete"), id: z.string().min(1) }),
  z.object({
    action: z.literal("thread-mode"),
    threadId: z.string().min(1),
    mode: memoryThreadModeSchema,
  }),
  z.object({ action: z.literal("dream") }),
  z.object({ action: z.literal("undo"), runId: z.string().min(1) }),
  z.object({ action: z.literal("suggestions"), projectId: z.string().min(1).optional() }),
  z.object({
    action: z.literal("suggestion"),
    id: z.string().min(1),
    decision: z.enum(["approve", "dismiss"]),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    body: z.string().optional(),
    scope: memoryScopeSchema.optional(),
    availability: z.enum(["shared", "poracode"]).optional(),
    projectId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    action: z.literal("sync-export"),
    projectRepoKeys: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    action: z.literal("sync-merge"),
    state: memorySyncStateSchema,
    projectRepoKeys: z.record(z.string(), z.string()).optional(),
  }),
]);
export type MemoryCommandPayload = z.infer<typeof memoryCommandPayloadSchema>;

export const generateMemoryTextPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  prompt: z.string().min(1),
  selection: modelSelectionSchema.optional(),
});
export type GenerateMemoryTextPayload = z.infer<typeof generateMemoryTextPayloadSchema>;

export interface GenerateMemoryTextResult {
  text: string;
}

/** Idle wait after a turn finishes before a capture model call. */
export function memorySettleMs(settings: MemorySettings): number | null {
  switch (settings.captureTiming) {
    case "settle-2m":
      return 120_000;
    case "settle-90s":
      return 90_000;
    case "custom":
      return settings.captureCustomMinutes * 60_000;
    case "lifecycle":
      return null;
  }
}

export function memoryDreamIntervalMs(settings: MemorySettings): number | null {
  switch (settings.dreamCadence) {
    case "daily":
      return 24 * 60 * 60 * 1000;
    case "3d":
      return 3 * 24 * 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    case "manual":
      return null;
  }
}
