import {
  type RendererStreamDeliveryTarget,
  type RendererStreamOwnershipGrant,
  type RendererWindowDeliveryState,
} from "@/shared/backendHostProtocol";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import { EMPTY_RENDERER_EVENT_INTERESTS } from "./rendererEventInterestRegistry";

/**
 * Composes the authoritative per-window delivery table main pushes to the
 * backend host: one entry per minted grant, carrying that window's latest
 * registered interests and its role in the untargeted shell contract. The
 * table is keyed by grants because main mints a window's identity and
 * generation in the same step that publishes its interests — an interests
 * entry without a grant has no supported producer and is omitted (the window
 * is gone or being destroyed; dropping it ends its fallback copies, which is
 * correct). A grant whose interests entry is missing ships empty interests
 * rather than vanishing, so the window stays a known fallback consumer.
 */
export function buildRendererDeliveryTable(
  grants: ReadonlyMap<number, RendererStreamOwnershipGrant>,
  interestsByWindow: ReadonlyMap<number, LiveEventInterests>,
  shellRemainderWindowId: number | null,
): RendererWindowDeliveryState[] {
  const windows: RendererWindowDeliveryState[] = [];
  for (const [windowId, grant] of grants) {
    windows.push({
      windowId,
      grant,
      interests: interestsByWindow.get(windowId) ?? EMPTY_RENDERER_EVENT_INTERESTS,
      receivesShellRemainder: windowId === shellRemainderWindowId,
    });
  }
  return windows;
}

/**
 * Resolves a targeted fallback copy's recipient among main's live windows.
 * Only exact webContents-id matches on non-destroyed windows qualify: a copy
 * addressed to window A must never leak to window B, and a destroyed target
 * drops the copy instead of redirecting it. Generation staleness is enforced
 * separately against main's minted grants (the grant authority), so this
 * resolver stays a pure identity lookup.
 */
export function resolveDeliveryTargetWindow<
  T extends { webContents: { id: number }; isDestroyed(): boolean },
>(target: RendererStreamDeliveryTarget, windows: readonly (T | null)[]): T | null {
  for (const window of windows) {
    if (!window || window.isDestroyed()) continue;
    if (window.webContents.id === target.windowId) return window;
  }
  return null;
}
