import { z } from "zod";
import type { ToolTextSource, ToolValueSource } from "../toolPresentationSource";
import {
  PRESENTATION_INPUT_MAX_BYTES,
  PRESENTATION_INPUT_MAX_DEPTH,
  PRESENTATION_INPUT_MAX_NODES,
} from "../presentationInput";
import { RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT } from "./runtimeItemPresentation";

/** Base catalog V1 stays valid: older readers ignore unknown optional heading
 * projections and retain its original header/body. V2 reads require opt-in. */
export const TOOL_PRESENTATION_VERSION = 1 as const;
export const TOOL_PRESENTATION_MAX_WIRE_BYTES = 4096;

const path = z
  .array(z.union([z.string().max(128), z.number().int().min(0).max(1_000_000)]))
  .max(12);
const headerLabel = z.enum(["run", "edit", "create", "delete", "search", "view"]);

export const toolValueSourceSchema = z.object({
  root: z.enum(["payload", "streams"]),
  path,
  format: z.enum(["value", "json", "text-list", "terminal"]),
  accept: z.enum(["string", "non-string", "scalar", "object"]).optional(),
  eachPath: path.optional(),
}) satisfies z.ZodType<ToolValueSource>;

export const toolTextSourceSchema = z.union([
  toolValueSourceSchema,
  z.object({ firstNonempty: z.array(toolValueSourceSchema).min(1).max(8) }),
]) satisfies z.ZodType<ToolTextSource>;

export const toolPresentationSectionSchema = z.object({
  kind: z.enum(["code", "terminal", "markdown"]),
  label: z.enum(["args", "result", "output", "command", "changes", "content", "error"]).optional(),
  prefix: z.string().max(16).optional(),
  onlyLanguage: z.enum(["plain", "json", "diff"]).optional(),
  replaceFollowing: z.boolean().optional(),
  source: toolTextSourceSchema,
});

const projectionFields = {
  maxItems: z.literal(RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT),
  maxInputBytes: z.literal(PRESENTATION_INPUT_MAX_BYTES),
  maxDepth: z.literal(PRESENTATION_INPUT_MAX_DEPTH),
  maxNodes: z.literal(PRESENTATION_INPUT_MAX_NODES),
  inputs: z.array(z.object({ root: z.enum(["payload", "streams"]), path })).max(32),
};
const conditionalProjectionFields = {
  ...projectionFields,
  conditions: z
    .array(
      z.object({
        root: z.enum(["payload", "streams"]),
        path,
        values: z
          .array(z.union([z.string().max(512), z.null()]))
          .min(1)
          .max(64),
      }),
    )
    .min(1)
    .max(8),
};

export const toolPresentationSchema = z.object({
  version: z.literal(TOOL_PRESENTATION_VERSION),
  header: z
    .object({
      label: headerLabel.optional(),
      labelChoice: z
        .object({ source: toolTextSourceSchema, labels: z.record(z.string().max(64), headerLabel) })
        .optional(),
      source: toolTextSourceSchema,
      path: z.boolean().optional(),
      context: toolTextSourceSchema.optional(),
    })
    .optional(),
  sections: z.array(toolPresentationSectionSchema).max(8),
  /** Additive opt-in display reads. V1/V2 never require conditions. */
  headerProjection: z
    .object({
      version: z.union([z.literal(1), z.literal(2)]),
      ...projectionFields,
    })
    .optional(),
  workflowProjection: z
    .object({ version: z.literal(3), ...conditionalProjectionFields })
    .optional(),
  workflowViewProjection: z
    .object({ version: z.literal(4), ...conditionalProjectionFields })
    .optional(),
  /** Resolved blocks are separate from heading/viewer budgets and are optional. */
  bodyProjection: z.object({ version: z.literal(5), ...conditionalProjectionFields }).optional(),
  mediaSources: z
    .array(z.object({ root: z.enum(["payload", "streams"]), path }))
    .max(4)
    .optional(),
});
export type ToolPresentation = z.infer<typeof toolPresentationSchema>;

/**
 * The typed branch generates native bindings. The opaque branch preserves a
 * future/unsupported descriptor without rejecting or rewriting the actual item.
 * Consumers must accept the v1 branch before rendering any of its sections.
 */
export const toolPresentationCatalogSchema = z.object({
  version: z.literal(TOOL_PRESENTATION_VERSION),
  itemTypes: z
    .array(z.object({ itemType: z.string().min(1).max(64), presentation: toolPresentationSchema }))
    .max(16),
});
export type ToolPresentationCatalog = z.infer<typeof toolPresentationCatalogSchema>;

export const toolPresentationCatalogSlotSchema = z.union([
  toolPresentationCatalogSchema,
  z.record(z.string(), z.unknown()),
]);
