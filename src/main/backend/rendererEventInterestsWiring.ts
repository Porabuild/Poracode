import type { LiveEventInterests } from "@/shared/liveEventInterests";
import {
  RendererEventInterestRegistry,
  type RendererEventSender,
} from "./rendererEventInterestRegistry";

export interface RendererEventInterestsWiringOptions {
  /** Pushes the union of every registered window's interests to the host. */
  pushUnionInterests(interests: LiveEventInterests): Promise<unknown>;
  /** Reports asynchronous push failures (Sentry capture); pushes never reject. */
  onError(error: unknown): void;
}

/**
 * Production wiring for main's renderer event-interest publication (V5 plan
 * 2.5): the host's live-event router routes the union of all windows'
 * interests, so the union is pushed only when it actually changes. The former
 * per-window delivery table and its minted grants left with the deleted
 * renderer-direct stream.
 */
export class RendererEventInterestsWiring {
  private readonly registry: RendererEventInterestRegistry;

  constructor(private readonly options: RendererEventInterestsWiringOptions) {
    this.registry = new RendererEventInterestRegistry((merged) => {
      void options.pushUnionInterests(merged).catch(options.onError);
    });
  }

  /** Publishes one window's interests (or the anonymous window's, sender null). */
  setInterests(sender: RendererEventSender | null, interests: LiveEventInterests): void {
    this.registry.set(sender ?? null, interests);
  }

  /** Drops one window's interests. */
  release(senderId: number): void {
    this.registry.release(senderId);
  }

  /** Drops every window's interests. */
  releaseAll(): void {
    this.registry.releaseAll();
  }
}
