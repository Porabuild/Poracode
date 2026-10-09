import { z } from "zod";
import { projectLocationSchema } from "../contracts/common";

/** External access must be explicit; a failed contained read never escalates to it. */
export const mediaFileRequestSchema = z.discriminatedUnion("access", [
  z.object({
    access: z.literal("project"),
    projectLocation: projectLocationSchema,
    path: z.string().min(1).max(4096),
  }),
  z.object({
    access: z.literal("external"),
    projectLocation: projectLocationSchema,
    path: z.string().min(1).max(4096),
  }),
]);
export type MediaFileRequest = z.infer<typeof mediaFileRequestSchema>;

export const mediaTicketSchema = z.string().regex(/^pc_media_[A-Za-z0-9_-]{43}$/u);
export const mediaTicketQuerySchema = z.object({ ticket: mediaTicketSchema });
export const mediaTicketResultSchema = z.object({
  ticket: mediaTicketSchema,
  expiresAt: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAtMs: z.number().nonnegative(),
  contentType: z.string().min(1),
});
export type MediaTicketResult = z.infer<typeof mediaTicketResultSchema>;

export const environmentMediaTicketBodySchema = z.object({ childTicket: mediaTicketSchema });
export const environmentMediaTicketResultSchema = z.object({
  ticket: mediaTicketSchema,
  expiresAt: z.string().min(1),
});
export type EnvironmentMediaTicketResult = z.infer<typeof environmentMediaTicketResultSchema>;

export interface MediaSource extends MediaTicketResult {
  /** Contains only temporary, file-scoped grants. Never a bearer or refresh token. */
  readonly url: string;
}
