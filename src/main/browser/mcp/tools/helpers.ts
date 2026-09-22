import type { ResolvedBrowserTab, ToolContext } from "./types";

/** createTab options for an agent-created tab, carrying the calling thread so it
 *  joins that thread's tab group (named by the task). */
export function agentTabOpts(ctx: ToolContext): {
  agent: true;
  threadId?: string;
  threadTitle?: string;
} {
  return {
    agent: true,
    ...(ctx.threadId ? { threadId: ctx.threadId } : {}),
    ...(ctx.threadTitle ? { threadTitle: ctx.threadTitle } : {}),
  };
}

export async function resolveTabId(
  ctx: ToolContext,
  payload: Record<string, unknown>,
): Promise<string> {
  const requested = typeof payload.tabId === "string" ? payload.tabId : null;
  if (requested) {
    // Marks agent activity + revives the tab if it was unmounted while idle.
    await ctx.manager.ensureTabReady(requested);
    return requested;
  }
  const active = ctx.manager.getActiveTab();
  if (active) {
    await ctx.manager.ensureTabReady(active.tabId);
    return active.tabId;
  }
  const info = await ctx.manager.createTab({ activate: true }, agentTabOpts(ctx));
  return info.tabId;
}

export async function requireTab(
  ctx: ToolContext,
  payload: Record<string, unknown>,
): Promise<{ tab: ResolvedBrowserTab }> {
  const tabId = await resolveTabId(ctx, payload);
  const tab = ctx.manager.getTab(tabId);
  if (!tab) throw new Error(`unknown tab ${tabId}`);
  return { tab };
}
