import { describe, expect, it, vi } from "vitest";
import { filterSupervisorEventForInterests } from "@/backend/BackendHostCore";
import { RendererStreamOwnership } from "@/backend/RendererStreamOwnership";
import { planDesktopRelay } from "@/backend/supervisorEventFallback";
import {
  RENDERER_STREAM_UNGRANTED_GENERATION,
  type RendererWindowDeliveryState,
} from "@/shared/backendHostProtocol";
import type { SupervisorEvent } from "@/shared/ipc";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import type { RendererEventSender } from "./rendererEventInterestRegistry";
import { RendererEventInterestsWiring } from "./rendererEventInterestsWiring";

function fakeSender(id: number): { sender: RendererEventSender; destroy(): void } {
  const listeners: Array<() => void> = [];
  return {
    sender: {
      id,
      once: (_channel, listener) => {
        listeners.push(listener);
        return listener;
      },
    },
    destroy: () => {
      for (const listener of listeners.splice(0)) listener();
    },
  };
}

function interests(terminalThreadIds: string[]): LiveEventInterests {
  return { terminalThreadIds, runtimeThreadIds: [], allRuntimeEvents: false };
}

function output(threadId: string): SupervisorEvent {
  return {
    type: "thread-output",
    threadId,
    data: "x",
    outputLength: 1,
    terminalInstanceId: "gen-test",
  };
}

/**
 * Composes the real wiring with the real backend delivery surfaces: every
 * pushed table is consumed verbatim by `RendererStreamOwnership`, and the
 * fallback targeting below is the production planner reading that state.
 */
function makeComposition() {
  const tables: Array<readonly RendererWindowDeliveryState[]> = [];
  const unions: LiveEventInterests[] = [];
  const onError = vi.fn<(error: unknown) => void>();
  const ownership = new RendererStreamOwnership();
  const wiring = new RendererEventInterestsWiring({
    pushUnionInterests: async (merged) => {
      unions.push(merged);
    },
    pushDeliveryTable: async (windows) => {
      tables.push(windows);
      ownership.setWindows(windows);
    },
    onError,
    shellRemainderWindowId: () => 1,
  });
  const fallbackWindowIdsFor = (event: SupervisorEvent): number[] =>
    planDesktopRelay({
      event,
      ownershipArmed: ownership.isArmed(),
      fallbackWindows: ownership.fallbackWindows(),
      isTerminalBootstrapRetainedFor: () => false,
      filterEventForInterests: (entry, windowInterests) =>
        filterSupervisorEventForInterests(entry, windowInterests),
      filterShellEvent: (entry) => entry,
    })
      .copies.map((copy) => copy.target.windowId)
      .sort((a, b) => a - b);
  return { wiring, tables, unions, onError, ownership, fallbackWindowIdsFor };
}

describe("RendererEventInterestsWiring", () => {
  it("publishes a second window whose subset does not move the merged union", () => {
    const { wiring, tables, unions, fallbackWindowIdsFor } = makeComposition();
    wiring.setInterests(fakeSender(1).sender, interests(["t-a"]));
    expect(unions).toHaveLength(1);
    expect(tables).toHaveLength(1);

    // A second window subscribing to a subset of the same thread leaves the
    // union unchanged, but its own table entry must still publish: otherwise
    // the backend never targets its fallback copies.
    wiring.setInterests(fakeSender(2).sender, interests(["t-a"]));
    expect(unions).toHaveLength(1);
    expect(tables).toHaveLength(2);
    expect(tables.at(-1)?.find((window) => window.windowId === 2)).toMatchObject({
      interests: { terminalThreadIds: ["t-a"] },
      receivesShellRemainder: false,
    });
    expect(fallbackWindowIdsFor(output("t-a"))).toEqual([1, 2]);
  });

  it("republishes an existing window's slice when the union stays fixed", () => {
    const { wiring, tables, unions, fallbackWindowIdsFor } = makeComposition();
    wiring.setInterests(fakeSender(1).sender, interests(["t-a", "t-b"]));
    wiring.setInterests(fakeSender(2).sender, interests(["t-a"]));
    expect(unions).toHaveLength(1);

    // B narrows its own slice from t-a to t-b: the merged union is unchanged,
    // yet the table must follow so t-b reaches B and t-a stops targeting it.
    wiring.setInterests(fakeSender(2).sender, interests(["t-b"]));
    expect(unions).toHaveLength(1);
    expect(tables.at(-1)?.find((window) => window.windowId === 2)).toMatchObject({
      interests: { terminalThreadIds: ["t-b"] },
    });
    expect(fallbackWindowIdsFor(output("t-b"))).toEqual([1, 2]);
    expect(fallbackWindowIdsFor(output("t-a"))).toEqual([1]);
  });

  it("revokes a released window and recovers it with a fresh generation", () => {
    const { wiring, tables, ownership, fallbackWindowIdsFor } = makeComposition();
    wiring.setInterests(fakeSender(1).sender, interests(["t-a"]));
    wiring.setInterests(fakeSender(2).sender, interests(["t-a"]));
    const firstGrant = tables.at(-1)?.find((window) => window.windowId === 2)?.grant;
    expect(firstGrant).toBeDefined();
    expect(fallbackWindowIdsFor(output("t-a"))).toEqual([1, 2]);

    wiring.release(2);
    expect(tables.at(-1)?.some((window) => window.windowId === 2)).toBe(false);
    expect(fallbackWindowIdsFor(output("t-a"))).toEqual([1]);
    expect(ownership.generationFor(2)).toBe(RENDERER_STREAM_UNGRANTED_GENERATION);

    // Recovery after a reload: the fresh connect mints a new generation, the
    // old epoch is fenced, and the window is a fallback consumer again.
    const recovered = fakeSender(2);
    const grant = wiring.grantFor(recovered.sender);
    wiring.setInterests(recovered.sender, interests(["t-a"]));
    expect(grant.generation).toBeGreaterThan(firstGrant!.generation);
    expect(wiring.isStaleDeliveryTarget({ windowId: 2, generation: firstGrant!.generation })).toBe(
      true,
    );
    expect(wiring.isStaleDeliveryTarget({ windowId: 2, generation: grant.generation })).toBe(false);
    expect(fallbackWindowIdsFor(output("t-a"))).toEqual([1, 2]);
  });

  it("reports a rejected table push once without escaping setInterests and retries", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const tables: Array<readonly RendererWindowDeliveryState[]> = [];
    let attempts = 0;
    const wiring = new RendererEventInterestsWiring({
      pushUnionInterests: async () => {},
      pushDeliveryTable: async (windows) => {
        attempts += 1;
        if (attempts === 1) throw new Error("host not running");
        tables.push(windows);
      },
      onError,
      shellRemainderWindowId: () => null,
    });
    const sender = fakeSender(4);

    expect(() => wiring.setInterests(sender.sender, interests(["t-a"]))).not.toThrow();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "host not running" }),
    );

    wiring.setInterests(sender.sender, interests(["t-b"]));
    expect(tables).toHaveLength(1);
    expect(tables[0]?.find((window) => window.windowId === 4)).toMatchObject({
      interests: { terminalThreadIds: ["t-b"] },
    });
  });
});
