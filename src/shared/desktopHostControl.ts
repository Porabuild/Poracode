import { z } from "zod";

// Private main→backend delegation. This does not grant remote or renderer access.
export const DESKTOP_HOST_CONTROL_VERSION = 1;
export const desktopHostControlGrantSchema = z.strictObject({
  version: z.literal(DESKTOP_HOST_CONTROL_VERSION),
  profileNamespace: z.string().min(1).max(4096),
  ownerGeneration: z.uuid(),
});
export type DesktopHostControlGrant = z.infer<typeof desktopHostControlGrantSchema>;
export const desktopHostControlAckSchema = z.strictObject({
  localControl: z.strictObject({
    version: z.literal(DESKTOP_HOST_CONTROL_VERSION),
    ownerGeneration: z.uuid(),
  }),
});
