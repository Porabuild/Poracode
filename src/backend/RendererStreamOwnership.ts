import {
  isRendererWindowDeliveryState,
  RENDERER_STREAM_UNGRANTED_GENERATION,
  type RendererStreamOwnershipGrant,
  type RendererWindowDeliveryState,
} from "@/shared/backendHostProtocol";
import type { LiveEventInterests } from "@/shared/liveEventInterests";

/** Minimal view of a connected stream client the ownership registry needs. */
export interface RendererStreamOwnershipClient {
  /** Window grants this connection currently owns; revoked when it closes. */
  readonly ownedWindowIds: Set<number>;
}

/** One registered desktop window's backend-side delivery state. */
export interface RendererStreamOwnershipEntry {
  /** The window's minted grant; every table entry carries one. */
  readonly grant: RendererStreamOwnershipGrant;
  /** The window's own interests; the fallback selector filters its copies by them. */
  interests: LiveEventInterests;
  /** True when this window consumes the untargeted shell remainder (main's window). */
  receivesShellRemainder: boolean;
  /** Live socket that owns this window's delivery, or null while it is a fallback consumer. */
  client: RendererStreamOwnershipClient | null;
}

/** A window that currently takes bulk events through the desktop-IPC fallback. */
export interface RendererStreamFallbackWindow {
  readonly windowId: number;
  /** Grant generation to fence targeted copies and recovery barriers with. */
  readonly generation: number;
  readonly interests: LiveEventInterests;
  /** True when this window consumes the shell remainder and must not receive controls twice. */
  readonly receivesShellRemainder: boolean;
}

/**
 * Backend-side registry of per-window delivery state for the direct renderer
 * stream.
 *
 * Main — the Electron IPC authority — pushes the complete per-window table
 * (minted grant plus that window's own interests) over the trusted
 * backend-host IPC. A stream connection becomes a window's delivery owner
 * only when its interests frame presents the exact minted
 * `{ generation, binding }` AND the handoff acknowledgement has been queued on
 * that live socket; the caller owns that ordering. Closing a connection
 * revokes everything it owns synchronously, so the fallback decision is
 * always evaluated per window against live sockets inside the backend
 * process — no cross-process renderer report can go stale mid-burst.
 *
 * Suppression is armed only by main's first table push. A stale main that
 * never pushes (backend upgraded ahead of it) keeps the legacy full-relay
 * behavior. An entry with no live owner — no push yet, transport connecting,
 * bind rejected, socket down, or a grant the renderer has not presented yet —
 * is a fallback consumer for its own interests only, never for its siblings':
 * fallback means no direct owner, not a missing grant.
 *
 * Malformed table pushes are rejected as a whole (the request fails loudly):
 * silently dropping an entry would silently strand that window's fallback
 * consumer on a table the backend does not actually hold.
 */
export class RendererStreamOwnership {
  private windows = new Map<number, RendererStreamOwnershipEntry>();
  private armed = false;

  /**
   * Replaces the authoritative per-window table pushed by main. Every entry
   * is validated first — one malformed entry rejects the whole push so a
   * consumer is never silently dropped. Keeping an entry whose grant is
   * byte-identical preserves its owner attachment and adopts the new
   * interests in place; any other grant change (re-mint, removal) revokes
   * that window's current owner immediately so a new generation can never be
   * shadowed by a lingering socket.
   */
  setWindows(windows: readonly RendererWindowDeliveryState[]): void {
    for (const entry of windows) {
      if (!isRendererWindowDeliveryState(entry)) {
        throw new Error(
          `Rejected a malformed renderer delivery entry for window ${String(
            (entry as { windowId?: unknown }).windowId,
          )}.`,
        );
      }
    }
    this.armed = true;
    const next = new Map<number, RendererStreamOwnershipEntry>();
    for (const pushed of windows) {
      const existing = this.windows.get(pushed.windowId);
      const unchangedGrant =
        existing !== undefined &&
        existing.grant.generation === pushed.grant.generation &&
        existing.grant.binding === pushed.grant.binding;
      if (unchangedGrant && existing) {
        existing.interests = pushed.interests;
        existing.receivesShellRemainder = pushed.receivesShellRemainder;
        next.set(pushed.windowId, existing);
      } else {
        next.set(pushed.windowId, {
          grant: pushed.grant,
          interests: pushed.interests,
          receivesShellRemainder: pushed.receivesShellRemainder,
          client: null,
        });
      }
    }
    for (const [windowId, existing] of this.windows) {
      if (next.get(windowId) !== existing) this.detach(windowId, existing);
    }
    this.windows = next;
  }

  /** Validates a binding presented on an interests frame; null when rejected. */
  match(
    windowId: number,
    generation: number,
    binding: string,
  ): RendererStreamOwnershipGrant | null {
    const entry = this.windows.get(windowId);
    if (!entry) return null;
    if (entry.grant.generation !== generation || entry.grant.binding !== binding) return null;
    return entry.grant;
  }

  /**
   * Activates ownership for a validated bind. Called only after the ack that
   * confirms the handoff has been queued on the owning socket. A previous
   * owner of the window (a second connection presenting the same current
   * grant) is superseded.
   */
  attach(windowId: number, client: RendererStreamOwnershipClient): void {
    const entry = this.windows.get(windowId);
    if (!entry) return;
    if (entry.client && entry.client !== client) entry.client.ownedWindowIds.delete(windowId);
    entry.client = client;
    client.ownedWindowIds.add(windowId);
  }

  /** Revokes every window a closing connection owns, synchronously. */
  detachClient(client: RendererStreamOwnershipClient): void {
    for (const windowId of client.ownedWindowIds) {
      const entry = this.windows.get(windowId);
      if (entry && entry.client === client) entry.client = null;
    }
    client.ownedWindowIds.clear();
  }

  /** True once main has pushed a per-window table at all. */
  isArmed(): boolean {
    return this.armed;
  }

  /** Every window that currently needs bulk events through the IPC fallback. */
  fallbackWindows(): RendererStreamFallbackWindow[] {
    const fallback: RendererStreamFallbackWindow[] = [];
    for (const [windowId, entry] of this.windows) {
      if (entry.client) continue;
      fallback.push({
        windowId,
        generation: entry.grant.generation,
        interests: entry.interests,
        receivesShellRemainder: entry.receivesShellRemainder,
      });
    }
    return fallback;
  }

  /** Grant generation for a window id, or the ungranted sentinel when unknown. */
  generationFor(windowId: number): number {
    return this.windows.get(windowId)?.grant.generation ?? RENDERER_STREAM_UNGRANTED_GENERATION;
  }

  private detach(windowId: number, entry: RendererStreamOwnershipEntry): void {
    if (entry.client) {
      entry.client.ownedWindowIds.delete(windowId);
      entry.client = null;
    }
  }
}
