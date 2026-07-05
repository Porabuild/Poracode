import { resolveRefToSelector } from "../../pageDriver";
import type { ResolvedBrowserTab, ToolContext } from "./types";

export function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export async function resolveTabId(
  ctx: ToolContext,
  payload: Record<string, unknown>,
): Promise<string> {
  const requested = typeof payload.tabId === "string" ? payload.tabId : null;
  if (requested) return requested;
  const active = ctx.manager.getActiveTab();
  if (active) return active.tabId;
  const info = await ctx.manager.createTab({ activate: true });
  return info.tabId;
}

export async function resolveSelectorArg(
  tab: ResolvedBrowserTab,
  payload: Record<string, unknown>,
): Promise<string | null> {
  if (typeof payload.selector === "string" && payload.selector.length > 0) {
    return payload.selector;
  }
  if (typeof payload.ref === "string" && payload.ref.length > 0) {
    return await resolveRefToSelector(tab.webContents, payload.ref);
  }
  return null;
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
