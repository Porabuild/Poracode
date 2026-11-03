import { resolveLaunchPluginOverrides } from "@/shared/contracts";
import type { AppControlsToolContext } from "./types";

/**
 * Effective plugin switches for the calling thread, as its next launch would
 * apply them: the project's switches beneath the thread's own choices. A
 * `projectId` selects whose project switches sit beneath the thread's.
 */
export function callerPluginOverrides(
  ctx: AppControlsToolContext,
  projectId?: string,
): Record<string, boolean> | undefined {
  const thread = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
  const targetProjectId = projectId ?? thread?.projectId;
  const project = targetProjectId ? ctx.getProject(targetProjectId) : null;
  return resolveLaunchPluginOverrides(project?.pluginOverrides, thread?.config.pluginOverrides);
}
