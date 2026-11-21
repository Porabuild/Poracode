import { z } from "zod";
import { resolvedToolBodySchema } from "./resolvedToolBody";

/** Opt-in advisory display read. It never rewrites canonical items or events. */
export const RUNTIME_ITEM_PRESENTATION_VERSION = 1 as const;
/** V1 remains byte/shape compatible. Only advertised tool headers opt into V2. */
export const RUNTIME_TOOL_PRESENTATION_VERSION = 2 as const;
/** Optional registration hints; V1/V2 never return or require this branch. */
export const RUNTIME_WORKFLOW_PRESENTATION_VERSION = 3 as const;
/** Viewer-only plan read. Registration V3 still never inspects scripts. */
export const RUNTIME_WORKFLOW_VIEW_VERSION = 4 as const;
/** Separate opt-in content read: V1–V4 budgets and replies stay unchanged. */
export const RUNTIME_TOOL_BODY_VERSION = 5 as const;
export const RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT = 32;

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const title = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("label"),
    label: z.enum([
      "check",
      "format-files",
      "git",
      "install-packages",
      "list",
      "list-packages",
      "package-config",
      "package-manager",
      "run",
      "search",
    ]),
    text: z.string().max(4096).optional(),
  }),
  z.object({
    kind: z.literal("view"),
    text: z.string().max(4096),
    lines: z.string().max(512).optional(),
  }),
  z.object({
    kind: z.literal("search"),
    query: z.string().max(4096),
    scope: z.string().max(4096).optional(),
    additionalPatterns: z.number().int().positive().optional(),
  }),
]);

export const runtimeCommandHeadingSchema = z.object({
  kind: z.enum(["check", "command", "git", "install", "list", "package", "search", "view"]),
  title,
  path: z.object({ path: z.string().max(4096), filePath: z.boolean().optional() }).optional(),
  additionalActions: z.number().int().positive().optional(),
});

const requestItems = z
  .array(z.object({ itemId: z.string().min(1).max(512), inputDigest: digest }))
  .min(1)
  .max(RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT);
export const runtimeItemPresentationRequestSchema = z.discriminatedUnion("version", [
  z.object({ version: z.literal(RUNTIME_ITEM_PRESENTATION_VERSION), items: requestItems }),
  z.object({ version: z.literal(RUNTIME_TOOL_PRESENTATION_VERSION), items: requestItems }),
  z.object({ version: z.literal(RUNTIME_WORKFLOW_PRESENTATION_VERSION), items: requestItems }),
  z.object({ version: z.literal(RUNTIME_WORKFLOW_VIEW_VERSION), items: requestItems }),
  z.object({ version: z.literal(RUNTIME_TOOL_BODY_VERSION), items: requestItems }),
]);

export const runtimeItemPresentationQuerySchema = z.object({
  notices: z.literal("v1"),
  maxBytes: z.number().int().positive().optional(),
  maxDecodeBytes: z.number().int().positive().optional(),
});

export const runtimeItemPresentationEntrySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    itemId: z.string().min(1),
    inputDigest: digest,
    header: z.object({
      command: runtimeCommandHeadingSchema,
      failed: z.boolean(),
      durationMs: z.number().finite().nonnegative().optional(),
    }),
  }),
  z.object({
    status: z.literal("unavailable"),
    itemId: z.string().min(1),
    reason: z.enum(["missing", "changed", "unsupported", "too_large"]),
  }),
]);

export const runtimeItemPresentationV1ResponseSchema = z.object({
  version: z.literal(RUNTIME_ITEM_PRESENTATION_VERSION),
  items: z.array(runtimeItemPresentationEntrySchema).max(RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT),
});
export type RuntimeItemPresentationEntry = z.infer<typeof runtimeItemPresentationEntrySchema>;

export const runtimeMcpToolHeadingSchema = z.object({
  kind: z.literal("mcp"),
  title: z.string().max(4096),
});
export const runtimeToolPresentationEntrySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    itemId: z.string().min(1),
    inputDigest: digest,
    header: z.object({ tool: runtimeMcpToolHeadingSchema, failed: z.boolean() }),
  }),
  z.object({
    status: z.literal("unavailable"),
    itemId: z.string().min(1),
    reason: z.enum(["missing", "changed", "unsupported", "too_large"]),
  }),
]);
export type RuntimeToolPresentationEntry = z.infer<typeof runtimeToolPresentationEntrySchema>;

export const runtimeWorkflowRegistrationSchema = z.object({
  runId: z.string().min(1).max(512),
  transcriptDir: z.string().min(1).max(4096),
  summary: z.string().max(4096).optional(),
  name: z.string().max(512).optional(),
});
export const runtimeWorkflowPresentationEntrySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    itemId: z.string().min(1),
    inputDigest: digest,
    header: z.object({ workflow: runtimeWorkflowRegistrationSchema }),
  }),
  z.object({
    status: z.literal("unavailable"),
    itemId: z.string().min(1),
    reason: z.enum(["missing", "changed", "unsupported", "too_large"]),
  }),
]);
export type RuntimeWorkflowPresentationEntry = z.infer<
  typeof runtimeWorkflowPresentationEntrySchema
>;

/** Generic workflow structure interpreted once by the producer's display hook.
 * Paths remain advisory: subsequent run/chat reads authorize their own scope. */
export const runtimeWorkflowViewSchema = z.object({
  description: z.string().max(4096).optional(),
  phases: z
    .array(z.object({ title: z.string().max(512), detail: z.string().max(4096).optional() }))
    .max(256),
  plannedAgents: z
    .array(
      z.object({
        label: z.string().max(4096),
        phaseTitle: z.string().max(512).optional(),
        model: z.string().max(512).optional(),
      }),
    )
    .max(1024),
  liveAgents: z
    .array(
      z.object({
        label: z.string().max(4096),
        phaseTitle: z.string().max(512).optional(),
        model: z.string().max(512).optional(),
      }),
    )
    .max(1024),
  runId: z.string().max(512).optional(),
  transcriptDir: z.string().max(4096).optional(),
});
export type RuntimeWorkflowView = z.infer<typeof runtimeWorkflowViewSchema>;
export const runtimeWorkflowViewEntrySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    itemId: z.string().min(1),
    inputDigest: digest,
    header: z.object({ workflowView: runtimeWorkflowViewSchema }),
  }),
  z.object({
    status: z.literal("unavailable"),
    itemId: z.string().min(1),
    reason: z.enum(["missing", "changed", "unsupported", "too_large"]),
  }),
]);
export type RuntimeWorkflowViewEntry = z.infer<typeof runtimeWorkflowViewEntrySchema>;
export const runtimeToolBodyEntrySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    itemId: z.string().min(1),
    inputDigest: digest,
    body: resolvedToolBodySchema,
  }),
  z.object({
    status: z.literal("unavailable"),
    itemId: z.string().min(1),
    reason: z.enum(["missing", "changed", "unsupported", "too_large"]),
  }),
]);
export type RuntimeToolBodyEntry = z.infer<typeof runtimeToolBodyEntrySchema>;
export const runtimeItemPresentationResponseSchema = z.discriminatedUnion("version", [
  runtimeItemPresentationV1ResponseSchema,
  z.object({
    version: z.literal(RUNTIME_TOOL_PRESENTATION_VERSION),
    items: z.array(runtimeToolPresentationEntrySchema).max(RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT),
  }),
  z.object({
    version: z.literal(RUNTIME_WORKFLOW_PRESENTATION_VERSION),
    items: z
      .array(runtimeWorkflowPresentationEntrySchema)
      .max(RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT),
  }),
  z.object({
    version: z.literal(RUNTIME_WORKFLOW_VIEW_VERSION),
    items: z.array(runtimeWorkflowViewEntrySchema).max(RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT),
  }),
  z.object({
    version: z.literal(RUNTIME_TOOL_BODY_VERSION),
    items: z.array(runtimeToolBodyEntrySchema).max(RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT),
  }),
]);
