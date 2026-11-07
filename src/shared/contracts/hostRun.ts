import { z } from "zod";
import { hostProjectSummarySchema } from "./hostProjects";
import {
  canonicalItemTypeSchema,
  canonicalRequestTypeSchema,
  requestPayloadSchema,
} from "./runtimeEvent";

// Local owner administration only; neither these jobs nor their IDs are remote grants.
// Format 1 stays unchanged for legacy runs; the v24 opt-in tool stream uses format 2.
export const HOST_RUN_FORMAT_VERSION = 1;
export const HOST_RUN_TOOL_EVENT_FORMAT_VERSION = 2;
export const HOST_RUN_CHUNK_BYTES = 32_768;
export const HOST_RUN_BUFFER_BYTES = 1_048_576;
export const HOST_RUN_TOOL_SUMMARY_BYTES = 2_048;
export const hostRunPreparationCommandSchema = z.strictObject({
  action: z.literal("run-prepare"),
  projectId: z.string().min(1).max(200),
  agentKind: z.string().min(1).max(128),
  model: z.string().min(1).max(256),
  effort: z.string().max(128).optional(),
  approvalPolicy: z.string().min(1).max(128).optional(),
  sandboxMode: z.string().min(1).max(128).optional(),
  wslDistro: z.string().min(1).max(200).optional(),
  prompt: z
    .string()
    .min(1)
    .max(16_384)
    .refine(
      (prompt) => prompt.trim().length > 0 && !prompt.trimStart().startsWith("/"),
      "Run requires a plain prompt. Use an interactive client for slash commands.",
    ),
});
export const hostRunCommandSchema = z.discriminatedUnion("action", [
  hostRunPreparationCommandSchema,
  hostRunPreparationCommandSchema
    .pick({ projectId: true, agentKind: true, wslDistro: true })
    .extend({ action: z.literal("run-options") }),
  z.strictObject({ action: z.literal("run-start"), runId: z.uuid() }),
  z.strictObject({ action: z.literal("run-read"), runId: z.uuid(), cursor: z.int().nonnegative() }),
  z.strictObject({ action: z.literal("run-cancel"), runId: z.uuid() }),
]);
export type HostRunCommand = z.infer<typeof hostRunCommandSchema>;
// Exact saved target/configuration; the original v15 run commands stay closed.
export const hostRunResumePreparationCommandSchema = z.strictObject({
  action: z.literal("run-resume-prepare"),
  threadId: z.string().min(1).max(200),
  prompt: hostRunPreparationCommandSchema.shape.prompt,
});
export type HostRunResumeCommand = z.infer<typeof hostRunResumePreparationCommandSchema>;
// Directory selection can persist a project; older owners must refuse before that effect.
export const hostRunDirectoryPreparationCommandSchema = hostRunPreparationCommandSchema
  .omit({ projectId: true, wslDistro: true })
  .extend({
    action: z.literal("run-directory-prepare"),
    directory: z.string().min(1).max(32768),
  });
export const hostRunDirectoryOptionsCommandSchema = hostRunDirectoryPreparationCommandSchema
  .pick({ directory: true, agentKind: true })
  .extend({ action: z.literal("run-directory-options") });
export const hostRunDirectoryCommandSchema = z.discriminatedUnion("action", [
  hostRunDirectoryPreparationCommandSchema,
  hostRunDirectoryOptionsCommandSchema,
]);
// File custody is opt-in under local admin21; legacy prepare requests remain closed.
export const HOST_RUN_MAX_FILES = 16;
export const HOST_RUN_MAX_FILE_BYTES = 20 * 1024 * 1024;
const runFiles = z.array(z.string().min(1).max(32768)).min(1).max(HOST_RUN_MAX_FILES);
export const hostRunFilesPreparationCommandSchema = hostRunPreparationCommandSchema.extend({
  action: z.literal("run-files-prepare"),
  files: runFiles,
});
export const hostRunFilesResumeCommandSchema = hostRunResumePreparationCommandSchema.extend({
  action: z.literal("run-resume-files-prepare"),
  files: runFiles,
});
export const hostRunFilesDirectoryCommandSchema = hostRunDirectoryPreparationCommandSchema.extend({
  action: z.literal("run-directory-files-prepare"),
  files: runFiles,
});
export const hostRunFilesCommandSchema = z.discriminatedUnion("action", [
  hostRunFilesPreparationCommandSchema,
  hostRunFilesResumeCommandSchema,
  hostRunFilesDirectoryCommandSchema,
]);
export type HostRunFilesCommand = z.infer<typeof hostRunFilesCommandSchema>;
// Opt-in interaction negotiates before any preparation effects. Existing
// preparation and format-1 streaming event shapes remain closed unchanged.
export const HOST_RUN_REQUEST_BYTES = 24_576;
export const hostRunInteractiveCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("run-interactive-prepare"),
    command: z.discriminatedUnion("action", [
      hostRunPreparationCommandSchema,
      hostRunResumePreparationCommandSchema,
      hostRunDirectoryPreparationCommandSchema,
      ...hostRunFilesCommandSchema.options,
    ]),
  }),
  z.strictObject({ action: z.literal("run-request-read"), runId: z.uuid() }),
  z.strictObject({
    action: z.literal("run-request-respond"),
    runId: z.uuid(),
    requestToken: z.uuid(),
    response: z
      .json()
      .refine(
        (value) => new TextEncoder().encode(JSON.stringify(value)).length <= HOST_RUN_REQUEST_BYTES,
        "The run response exceeds 24 KiB.",
      ),
  }),
]);
export type HostRunInteractiveCommand = z.infer<typeof hostRunInteractiveCommandSchema>;
export const hostRunPendingRequestSchema = z
  .strictObject({
    requestToken: z.uuid(),
    requestType: canonicalRequestTypeSchema,
    payload: requestPayloadSchema.strict().extend({ details: z.json().optional() }),
  })
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= HOST_RUN_REQUEST_BYTES,
    "This request is too large for interactive CLI review. Inspect it in a client.",
  );
const choice = z.strictObject({ id: z.string().min(1), label: z.string().min(1) });
export const hostRunOptionsSchema = z.strictObject({
  formatVersion: z.literal(HOST_RUN_FORMAT_VERSION),
  scope: z.literal("controlled-run-options"),
  projectId: z.string().min(1),
  agentKind: z.string().min(1),
  models: z.array(choice.extend({ efforts: z.array(z.string()) })),
  approvalPolicies: z.array(choice),
  sandboxModes: z.array(choice),
});
export const hostRunMetadataSchema = z.strictObject({
  formatVersion: z.union([
    z.literal(HOST_RUN_FORMAT_VERSION),
    z.literal(HOST_RUN_TOOL_EVENT_FORMAT_VERSION),
  ]),
  scope: z.literal("controlled-run"),
  runId: z.uuid(),
  threadId: z.string().min(1).max(200),
});
const directorySelection = {
  formatVersion: z.literal(HOST_RUN_FORMAT_VERSION),
  scope: z.literal("controlled-directory-run"),
  project: hostProjectSummarySchema,
  created: z.boolean(),
};
export const hostRunDirectoryPreparationSchema = z.strictObject({
  ...directorySelection,
  run: hostRunMetadataSchema,
});
export const hostRunDirectoryOptionsSchema = z.strictObject({
  ...directorySelection,
  options: hostRunOptionsSchema,
});
export const hostRunFinishedSchema = z.strictObject({
  type: z.literal("run.finished"),
  state: z.enum(["completed", "failed", "cancelled", "blocked"]),
  historyCommitted: z.boolean(),
  retirementConfirmed: z.boolean(),
  error: z.string().min(1).max(2_000).optional(),
});
export const hostRunToolEventSchema = z.strictObject({
  type: z.enum(["tool.started", "tool.updated", "tool.completed"]),
  itemId: z.string().min(1).max(200),
  itemType: canonicalItemTypeSchema,
  toolName: z.string().min(1).max(128),
  inputSummary: z.string().max(HOST_RUN_TOOL_SUMMARY_BYTES),
  outputSummary: z.string().max(HOST_RUN_TOOL_SUMMARY_BYTES).optional(),
});
export const hostRunEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("text.delta"),
    itemId: z.string().min(1).max(200),
    text: z.string().max(4_096),
    replace: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("request.required"),
    requestType: z.string().min(1).max(200),
    summary: z.string().max(2_000),
  }),
  hostRunToolEventSchema,
  hostRunFinishedSchema,
]);
export type HostRunEvent = z.infer<typeof hostRunEventSchema>;
export type HostRunFinished = z.infer<typeof hostRunFinishedSchema>;
export const hostRunReadSchema = hostRunMetadataSchema.extend({
  cursor: z.int().nonnegative(),
  nextCursor: z.int().nonnegative(),
  events: z.array(hostRunEventSchema).max(128),
  finished: z.boolean(),
});
export const hostRunResultSchema = hostRunMetadataSchema.extend({ result: hostRunFinishedSchema });
export const hostRunCancellationSchema = hostRunMetadataSchema.extend({ retired: z.literal(true) });
export const hostRunRequestReadSchema = hostRunMetadataSchema.extend({
  request: hostRunPendingRequestSchema.nullable(),
});
export const hostRunRequestReplySchema = hostRunMetadataSchema.extend({
  requestToken: z.uuid(),
  responded: z.literal(true),
});
