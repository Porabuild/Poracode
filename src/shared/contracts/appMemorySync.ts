import { z } from "zod";
import { desktopActionReplySchema } from "./appDesktopAction";

export const appMemorySyncRequestSchema = z.strictObject({ version: z.literal(1) });
export type AppMemorySyncRequest = z.infer<typeof appMemorySyncRequestSchema>;

export const appMemorySyncResultSchema = z.strictObject({
  syncedHosts: z.number().int().nonnegative(),
  changed: z.boolean(),
});
export type AppMemorySyncResult = z.infer<typeof appMemorySyncResultSchema>;

export const appMemorySyncReplySchema = desktopActionReplySchema(appMemorySyncResultSchema);
export const APP_MEMORY_SYNC_CLIENT_TIMEOUT_MS = 60_000;
