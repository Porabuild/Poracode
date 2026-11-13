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
/** Same-build navigation from a thread window to the main window. */
export const threadWindowNavigationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("thread"), threadId: z.string().min(1) }),
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
    lineNumber: z.number().int().positive().optional(),
  }),
  z.object({ kind: z.literal("review") }),
]);
export type ThreadWindowNavigation = z.infer<typeof threadWindowNavigationSchema>;
export interface ThreadWindowsChanged {
  threadIds: string[];
}
