import { z } from "zod";
import type { RuntimeEvent, WorkflowRun } from "../contracts";
import {
  projectLocationSchema,
  projectNotesSchema,
  projectSchema,
  threadContextUsageSchema,
  threadSchema,
} from "../contracts";

export const pickFilesOptionsSchema = z
  .object({
    title: z.string().optional(),
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

export const saveClipboardImagePayloadSchema = z.object({
  threadId: z.string().min(1),
  data: z.instanceof(Uint8Array),
  extension: z.string().min(1),
});

export const saveHandoffContextPayloadSchema = z.object({
  threadId: z.string().min(1),
  content: z.string(),
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
export const dbSyncAllPayloadSchema = z.object({
  projects: z.array(projectSchema),
  threads: z.array(threadSchema),
  viewJson: z.string(),
});

export const persistedRuntimeItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  state: z.enum(["started", "updated", "completed"]),
  payload: z.unknown(),
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

export const windowChromePayloadSchema = z.object({
  backgroundColor: z.string(),
  symbolColor: z.string(),
});
export type WindowChromePayload = z.infer<typeof windowChromePayloadSchema>;
