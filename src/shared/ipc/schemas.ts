import { z } from "zod";
import {
  agentKindSchema,
  experimentSchema,
  promptSegmentSchema,
  projectLocationSchema,
  projectNotesSchema,
  projectSchema,
  runtimeEventSchema,
  threadConfigSchema,
  threadContextUsageSchema,
  threadPresentationModeSchema,
  threadSchema,
  workflowRunSchema,
  type RuntimeEvent,
  type WorkflowRun,
} from "../contracts";

export const pickFilesOptionsSchema = z
  .object({
    title: z.string().optional(),
    /** Remote composer destination. The desktop dialog ignores this field. */
    attachmentThreadId: z.string().min(1).optional(),
    filters: z
      .array(
        z.object({
          name: z.string().min(1),
          extensions: z.array(z.string().min(1)),
        }),
      )
      .optional(),
  })
  .optional();

export const quickComposerSubmissionSchema = z.object({
  projectId: z.string().min(1),
  input: z.object({
    agentKind: agentKindSchema,
    config: threadConfigSchema,
    prompt: z.string().min(1),
    segments: z.array(promptSegmentSchema).optional(),
    existingWorktreePath: z.string().min(1).optional(),
    worktreeBranch: z.string().min(1).optional(),
    worktreeBaseBranch: z.string().min(1).optional(),
    worktreeIsNewBranch: z.boolean().optional(),
    worktreeTransferUncommitted: z.boolean().optional(),
    presentationMode: threadPresentationModeSchema.optional(),
  }),
});
export type QuickComposerSubmission = z.infer<typeof quickComposerSubmissionSchema>;

export const saveClipboardImagePayloadSchema = z.object({
  threadId: z.string().min(1),
  data: z.instanceof(Uint8Array),
  extension: z.string().min(1),
});

export const saveHandoffContextPayloadSchema = z.object({
  threadId: z.string().min(1),
  content: z.string(),
});

export const saveImageFilePayloadSchema = z.object({
  /** Raw image bytes to write to the user-chosen path. */
  data: z.instanceof(Uint8Array),
  /** Default file name shown in the Save dialog (e.g. `"generated-image.png"`). */
  suggestedName: z.string().min(1),
});

export const copyImageToClipboardPayloadSchema = z.object({
  /** Raw image bytes to place on the OS clipboard as an image. */
  data: z.instanceof(Uint8Array),
});

export const readLocalImageFilePayloadSchema = z.object({
  url: z.string().regex(/^(?:poracode|lightcode)-local:\/\//),
});

export const createProjectDirectoryPayloadSchema = z.object({
  /** Absolute parent directory (native path, or a `\\wsl...` UNC path). */
  parent: z.string().min(1),
  /** New folder name (validated by the renderer before sending). */
  name: z.string().min(1),
  kind: z.enum(["windows", "wsl", "posix"]),
});
export type CreateProjectDirectoryPayload = z.infer<typeof createProjectDirectoryPayloadSchema>;
export interface CreateProjectDirectoryResult {
  /** Absolute path of the newly-created directory. */
  path: string;
}

export const readThreadPayloadSchema = z.object({
  threadId: z.string().min(1),
});

export const subAgentSubscribePayloadSchema = z.object({
  threadId: z.string().min(1),
  parentItemId: z.string().min(1),
});
export type SubAgentSubscribePayload = z.infer<typeof subAgentSubscribePayloadSchema>;
export interface SubAgentSubscribeResult {
  history: RuntimeEvent[];
}

export const subAgentSubscribeResultSchema: z.ZodType<SubAgentSubscribeResult> = z.object({
  history: z.array(runtimeEventSchema),
});

export const workflowGetRunPayloadSchema = z.object({
  manifestPath: z.string().min(1),
  /** Used to scan for in-flight `agent-*.meta.json` files before the manifest exists. */
  transcriptDir: z.string().min(1).optional(),
  includeAgentChats: z.boolean().optional(),
  location: projectLocationSchema,
});
export type WorkflowGetRunPayload = z.infer<typeof workflowGetRunPayloadSchema>;
export interface WorkflowGetRunResult {
  /** `null` when the manifest doesn't exist yet — caller should keep polling. */
  run: WorkflowRun | null;
  mtimeMs?: number;
}

export const workflowGetRunResultSchema = z.object({
  run: workflowRunSchema.nullable(),
  mtimeMs: z.number().finite().nonnegative().optional(),
});

export const workflowAgentChatPayloadSchema = z.object({
  /** Synthetic renderer-side thread id the returned events are keyed under. */
  threadId: z.string().min(1),
  transcriptDir: z.string().min(1),
  agentId: z.string().min(1),
  /** When true, dangling open items are flushed to completed. */
  agentFinished: z.boolean(),
  location: projectLocationSchema,
});
export type WorkflowAgentChatPayload = z.infer<typeof workflowAgentChatPayloadSchema>;
export interface WorkflowAgentChatResult {
  events: RuntimeEvent[];
}

export const workflowAgentChatResultSchema: z.ZodType<WorkflowAgentChatResult> = z.object({
  events: z.array(runtimeEventSchema),
});

export const dbStateKeySchema = z.string().min(1);
export const dbStatePayloadSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});
export const dbDeleteThreadPayloadSchema = z.object({
  threadId: z.string().min(1),
});
export const dbDeleteProjectPayloadSchema = z.object({
  projectId: z.string().min(1),
});
const persistedThreadConfigSchema = threadConfigSchema
  .extend({ model: z.string() })
  .transform((config) => (config.model.trim().length > 0 ? config : { ...config, model: "auto" }));
export const persistedThreadSchema = threadSchema.extend({
  config: persistedThreadConfigSchema,
});
export const dbSyncAllPayloadSchema = z.object({
  projects: z.array(projectSchema),
  threads: z.array(persistedThreadSchema),
  viewJson: z.string(),
});
export const dbPersistExperimentStatePayloadSchema = z.object({
  upsertThreads: z.array(
    z.object({
      thread: persistedThreadSchema,
      sortOrder: z.number().int().nonnegative(),
    }),
  ),
  deletedThreadIds: z.array(z.string().min(1)),
  experiments: z.record(z.string(), experimentSchema),
});
export type DbPersistExperimentStatePayload = z.infer<typeof dbPersistExperimentStatePayloadSchema>;

export const persistedRuntimeItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  state: z.enum(["started", "updated", "completed"]),
  // Optional: items persisted without a payload round-trip as a missing key
  // over JSON transports (the remote API), unlike structured-clone IPC.
  payload: z.unknown().optional(),
  streams: z.record(z.string(), z.string()),
  parentItemId: z.string().optional(),
});
export type PersistedRuntimeItem = z.infer<typeof persistedRuntimeItemSchema>;

export const dbReplaceRuntimeItemsPayloadSchema = z.object({
  threadId: z.string().min(1),
  items: z.array(persistedRuntimeItemSchema),
});
export const dbGetRuntimeItemsPayloadSchema = z.object({
  threadId: z.string().min(1),
});
export const dbGetRuntimeItemsPagePayloadSchema = z.object({
  threadId: z.string().min(1),
  beforePosition: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(500),
  targetTimelineEntryCount: z.number().int().min(1).max(100).optional(),
});
export const dbTruncateRuntimeItemsPayloadSchema = z.object({
  threadId: z.string().min(1),
  itemId: z.string().min(1),
});
export const persistedRuntimePageSchema = z.object({
  items: z.array(persistedRuntimeItemSchema),
  nextCursor: z.number().int().nonnegative().nullable(),
});
export type PersistedRuntimePage = z.infer<typeof persistedRuntimePageSchema>;

export const persistedCompletedTurnSchema = z.object({
  startedAt: z.string().min(1),
  endedAt: z.string().min(1),
  anchorItemId: z.string().nullable(),
});
export type PersistedCompletedTurn = z.infer<typeof persistedCompletedTurnSchema>;

export const dbGetCompletedTurnsPayloadSchema = z.object({
  threadId: z.string().min(1),
});
export const dbReplaceCompletedTurnsPayloadSchema = z.object({
  threadId: z.string().min(1),
  turns: z.array(persistedCompletedTurnSchema),
});
export const dbReplaceRuntimeSnapshotPayloadSchema = z.object({
  threadId: z.string().min(1),
  items: z.array(persistedRuntimeItemSchema),
  turns: z.array(persistedCompletedTurnSchema),
  contextUsage: threadContextUsageSchema.nullable().optional(),
});

export const dbGetThreadContextUsagePayloadSchema = z.object({
  threadId: z.string().min(1),
});

export const dbGetProjectNotesPayloadSchema = z.object({
  projectId: z.string().min(1),
});
export const dbSetProjectNotesPayloadSchema = projectNotesSchema;

export const openExternalPayloadSchema = z.string().min(1);

export const showNotificationPayloadSchema = z.object({
  /** Notification title (already localized by the renderer). */
  title: z.string(),
  /** Notification body (already localized by the renderer). */
  body: z.string(),
  /** Thread to open when the notification is clicked. */
  threadId: z.string().min(1),
});
export type ShowNotificationPayload = z.infer<typeof showNotificationPayloadSchema>;

export const windowChromePayloadSchema = z.object({
  backgroundColor: z.string(),
  symbolColor: z.string(),
  /**
   * Whether the translucent ("liquid glass") sidebar material should be active.
   * The main process toggles it live (Windows acrylic; macOS vibrancy is created
   * with the window and revealed via CSS). Optional for callers predating it.
   */
  materialEnabled: z.boolean().optional(),
  /**
   * Resolved app appearance. When a native translucency material is active the
   * main process mirrors this onto `nativeTheme.themeSource` so the vibrancy /
   * acrylic material renders in the matching light/dark variant instead of the
   * OS default. Optional for callers that predate the toggle.
   */
  appearance: z.enum(["light", "dark"]).optional(),
});
export type WindowChromePayload = z.infer<typeof windowChromePayloadSchema>;

/**
 * Result of {@link windowChromePayloadSchema}: whether the OS supports a native
 * blur material (macOS vibrancy / Windows 11 acrylic). The renderer uses it to
 * decide whether to reveal the real material (transparent-window CSS) or the
 * pure-CSS fallback (Linux / Windows 10). The material itself is toggled live.
 */
export interface WindowChromeResult {
  nativeCapable: boolean;
}
