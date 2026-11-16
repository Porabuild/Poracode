import { z } from "zod";
import { projectDraftConfigSchema, draftPromptSegmentSchema } from "@/shared/contracts";
import type { DraftContent } from "../slices/types";

export const draftContentSchema = z
  .object({
    segments: z.array(draftPromptSegmentSchema),
    attachments: z.array(
      z.object({
        id: z.string(),
        path: z.string(),
        name: z.string(),
        mimeType: z.string().optional(),
        isImage: z.boolean(),
        selector: z.string().optional(),
        sourceUrl: z.string().optional(),
        source: z
          .object({ remoteServerId: z.string().optional(), path: z.string().optional() })
          .optional(),
      }),
    ),
  })
  .transform((content): DraftContent => ({
    segments: content.segments,
    attachments: content.attachments.map((attachment) => ({
      id: attachment.id,
      path: attachment.path,
      name: attachment.name,
      isImage: attachment.isImage,
      ...(attachment.mimeType !== undefined ? { mimeType: attachment.mimeType } : {}),
      ...(attachment.selector !== undefined ? { selector: attachment.selector } : {}),
      ...(attachment.sourceUrl !== undefined ? { sourceUrl: attachment.sourceUrl } : {}),
      ...(attachment.source !== undefined
        ? {
            source: {
              ...(attachment.source.remoteServerId !== undefined
                ? { remoteServerId: attachment.source.remoteServerId }
                : {}),
              ...(attachment.source.path !== undefined ? { path: attachment.source.path } : {}),
            },
          }
        : {}),
    })),
  }));
export const recordSchema = z.object({
  formatVersion: z.literal(2),
  draftId: z.string(),
  revision: z.number().int().nonnegative(),
  content: draftContentSchema,
  selection: projectDraftConfigSchema.optional(),
  legacyFingerprint: z.string().optional(),
});
export type DraftKind = "project" | "thread";
export type DraftCheckpoint = z.infer<typeof recordSchema> & { kind: DraftKind; ownerId: string };
