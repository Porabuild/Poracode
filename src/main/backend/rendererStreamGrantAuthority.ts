import { randomBytes } from "node:crypto";
import {
  type RendererStreamDeliveryTarget,
  type RendererStreamOwnershipGrant,
  type RendererWindowDeliveryState,
} from "@/shared/backendHostProtocol";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import { buildRendererDeliveryTable } from "./rendererDeliveryTable";
import type { RendererEventSender } from "./rendererEventInterestRegistry";

export interface RendererStreamGrantAuthorityOptions {
  /**
   * Pushes the complete per-window delivery table to the backend host.
   * Typically `BackendHostClient.setRendererStreamOwnership`.
   */
  pushDeliveryTable(windows: readonly RendererWindowDeliveryState[]): Promise<unknown>;
  /** Reports sync failures (Sentry capture); syncs never throw into callers. */
  onError(error: unknown): void;
  /**
   * The webContents id that consumes the untargeted shell remainder (Electron
   * main's own window), or null while that window does not exist. Declared in
   * the table so the backend can keep that window's controls exact-once.
   */
  shellRemainderWindowId(): number | null;
  /** Latest per-window registered interests, keyed by authoritative webContents id. */
  interestsByWindow(): ReadonlyMap<number, LiveEventInterests>;
}

/**
 * Main's single owner of renderer-stream delivery-identity plumbing: minting
 * per-window grants, releasing them on destroy/navigation, declaring the
 * shell-remainder role, and syncing the composed table to the backend host.
 *
 * Grants are keyed by the authoritative webContents id; the binding secret is
 * shared only with that window's renderer through its preload-bridge reply. A
 * destroyed or reloaded window drops its grant so a stale socket can never
 * hold ownership across a new generation. Identity and generation are
 * allocated synchronously BEFORE the window's interests are published, so a
 * table push never ships an entry whose grant has not been minted.
 */
export class RendererStreamGrantAuthority {
  private readonly grants = new Map<number, RendererStreamOwnershipGrant>();
  private readonly observedSenders = new WeakSet<RendererEventSender>();
  private nextGeneration = 0;

  constructor(private readonly options: RendererStreamGrantAuthorityOptions) {}

  /**
   * Returns the window's grant, minting one if absent. Called with the
   * authenticated `event.sender.id` — never a renderer-supplied value.
   */
  ensureGrant(windowId: number): RendererStreamOwnershipGrant {
    const existing = this.grants.get(windowId);
    if (existing) return existing;
    const grant = {
      windowId,
      generation: ++this.nextGeneration,
      binding: randomBytes(24).toString("base64url"),
    };
    this.grants.set(windowId, grant);
    return grant;
  }

  /** Drops a window's grant (destroy, navigate); the next sync revokes it backend-side. */
  dropGrant(windowId: number): void {
    this.grants.delete(windowId);
  }

  /** Drops every grant (full release). */
  clear(): void {
    this.grants.clear();
  }

  /**
   * Registers the release-once "destroyed" hook for a sender, first time only.
   * The drop and its table sync run when the webContents goes away.
   */
  observeRelease(sender: RendererEventSender): void {
    if (this.observedSenders.has(sender)) return;
    this.observedSenders.add(sender);
    sender.once("destroyed", () => {
      this.dropGrant(sender.id);
      void this.sync();
    });
  }

  /**
   * True when a strictly newer generation is already minted for the target
   * window: the frame was planned for a previous grant epoch (re-mint or
   * reload), so delivering it would apply stale-epoch data to the window's
   * current identity. Only provably-stale frames are rejected — an unknown
   * window or a not-yet-presented newer generation delivers, so dropping old
   * frames never creates a gap for an unchanged client.
   */
  isStaleDeliveryTarget(target: RendererStreamDeliveryTarget): boolean {
    const minted = this.grants.get(target.windowId);
    return minted !== undefined && target.generation < minted.generation;
  }

  /**
   * Composes and pushes the full per-window table to the backend host. A
   * failed push is reported once through
   * {@link RendererStreamGrantAuthorityOptions.onError} and never rejects:
   * every caller is a fire-and-forget mutation hook (interests publish, grant
   * pull, destroy/release), and the host client clears its dedupe key on
   * failure so the next sync retries the same table.
   */
  async sync(): Promise<void> {
    try {
      await this.options.pushDeliveryTable(
        buildRendererDeliveryTable(
          this.grants,
          this.options.interestsByWindow(),
          this.options.shellRemainderWindowId(),
        ),
      );
    } catch (error) {
      this.options.onError(error);
    }
  }
}
