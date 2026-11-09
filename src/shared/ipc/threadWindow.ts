import { z } from "zod";

/** Same-build desktop bootstrap for a thread shown in its own window. Never persisted. */
export const threadWindowBootstrapSchema = z.object({
  threadId: z.string().min(1),
  title: z.string(),
  remoteServerId: z.string().min(1).optional(),
});
export type ThreadWindowBootstrap = z.infer<typeof threadWindowBootstrapSchema>;
/** `returnToMain: false` closes the window without showing the thread in the main window. */
export const threadWindowCloseOptionsSchema = z
  .object({ returnToMain: z.boolean().optional() })
  .optional();
export type ThreadWindowCloseOptions = z.infer<typeof threadWindowCloseOptionsSchema>;
export interface ThreadWindowsChanged {
  threadIds: string[];
}
