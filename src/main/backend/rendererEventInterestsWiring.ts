import type {
  RendererStreamDeliveryTarget,
  RendererStreamOwnershipGrant,
  RendererWindowDeliveryState,
} from "@/shared/backendHostProtocol";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import {
  RendererEventInterestRegistry,
  type RendererEventSender,
} from "./rendererEventInterestRegistry";
import { RendererStreamGrantAuthority } from "./rendererStreamGrantAuthority";

export interface RendererEventInterestsWiringOptions {
  /** Pushes the union of every registered window's interests to the host. */
  pushUnionInterests(interests: LiveEventInterests): Promise<unknown>;
  /**
   * Pushes the complete per-window delivery table to the backend host.
   * Typically `BackendHostClient.setRendererStreamOwnership`.
   */
  pushDeliveryTable(windows: readonly RendererWindowDeliveryState[]): Promise<unknown>;
  /** Reports asynchronous push failures (Sentry capture); pushes never reject. */
  onError(error: unknown): void;
  /** The webContents id consuming the untargeted shell remainder, or null. */
  shellRemainderWindowId(): number | null;
}

/**
 * Production wiring for main's renderer event-interest publication.
 *
 * Two independent backend consumers derive from one registration:
 *
 * - the host's live-event router routes the union of all windows' interests
 *   (the shell relay and remote consumers), so the union is pushed only when
 *   it actually changes; and
 * - the per-window delivery table declares each window's own slice for the
 *   targeted desktop fallback, so it is republished for EVERY per-window
 *   interest or identity change — including one whose merged union is
 *   unchanged, which a union-change callback alone would miss.
 *
 * Identity and generation are minted synchronously before the interests entry
 * publishes, so a table push never ships an entry whose grant is not minted.
 * The host client dedupes identical tables, so republishing on every mutation
 * costs nothing when the resulting table is unchanged.
 */
export class RendererEventInterestsWiring {
  private readonly registry: RendererEventInterestRegistry;
  private readonly authority: RendererStreamGrantAuthority;

  constructor(private readonly options: RendererEventInterestsWiringOptions) {
    this.registry = new RendererEventInterestRegistry((merged) => {
      void options.pushUnionInterests(merged).catch(options.onError);
    });
    this.authority = new RendererStreamGrantAuthority({
      pushDeliveryTable: (windows) => options.pushDeliveryTable(windows),
      onError: options.onError,
      shellRemainderWindowId: () => options.shellRemainderWindowId(),
      interestsByWindow: () => this.registry.snapshotPerWindow(),
    });
  }

  /**
   * Publishes one window's interests. The grant is minted before the registry
   * entry so the table push that follows carries the window's identity, and
   * the table is republished unconditionally: an existing window can change
   * its own slice, or release, without changing the merged union.
   */
  setInterests(sender: RendererEventSender | null, interests: LiveEventInterests): void {
    if (sender) this.authority.ensureGrant(sender.id);
    this.registry.set(sender ?? null, interests);
    void this.authority.sync();
    if (sender) this.authority.observeRelease(sender);
  }

  /** Drops one window's interests and grant, then republishes the table. */
  release(senderId: number): void {
    this.registry.release(senderId);
    this.authority.dropGrant(senderId);
    void this.authority.sync();
  }

  /** Drops every window's interests and grants, then republishes the table. */
  releaseAll(): void {
    this.registry.releaseAll();
    this.authority.clear();
    void this.authority.sync();
  }

  /**
   * Returns the sender's minted grant, registering its release hook first
   * time only, and republishes the table for a first-time identity.
   */
  grantFor(sender: RendererEventSender): RendererStreamOwnershipGrant {
    const grant = this.authority.ensureGrant(sender.id);
    this.authority.observeRelease(sender);
    void this.authority.sync();
    return grant;
  }

  /** True when a targeted copy addresses a provably stale grant epoch. */
  isStaleDeliveryTarget(target: RendererStreamDeliveryTarget): boolean {
    return this.authority.isStaleDeliveryTarget(target);
  }
}
