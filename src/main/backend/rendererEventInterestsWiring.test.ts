import { describe, expect, it, vi } from "vitest";
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

const EMPTY: LiveEventInterests = {
  terminalThreadIds: [],
  runtimeThreadIds: [],
  allRuntimeEvents: false,
};

/**
 * Collapsed single-path wiring tests (V5 plan 2.5): the wiring's only backend
 * consumer is the union-interest push to the host's live-event router. The
 * per-window delivery table, grants, and stale-target fencing left with the
 * deleted renderer-direct stream.
 */
function makeWiring() {
  const unions: LiveEventInterests[] = [];
  const onError = vi.fn<(error: unknown) => void>();
  const wiring = new RendererEventInterestsWiring({
    pushUnionInterests: async (merged) => {
      unions.push(merged);
    },
    onError,
  });
  return { wiring, unions, onError };
}

describe("RendererEventInterestsWiring (union-only)", () => {
  it("pushes the merged union when it actually changes", () => {
    const { wiring, unions } = makeWiring();
    const a = fakeSender(1);
    const b = fakeSender(2);

    wiring.setInterests(a.sender, interests(["t-1"]));
    wiring.setInterests(b.sender, interests(["t-2"]));
    expect(unions.map((entry) => [...entry.terminalThreadIds].sort())).toEqual([
      ["t-1"],
      ["t-1", "t-2"],
    ]);

    // A re-registration that does not move the union does not push again.
    wiring.setInterests(a.sender, interests(["t-1"]));
    expect(unions).toHaveLength(2);
  });

  it("re-pushes the shrunk union when a window releases", () => {
    const { wiring, unions } = makeWiring();
    const a = fakeSender(1);
    const b = fakeSender(2);
    wiring.setInterests(a.sender, interests(["t-1"]));
    wiring.setInterests(b.sender, interests(["t-2"]));
    wiring.release(b.sender.id);
    expect(unions.map((entry) => [...entry.terminalThreadIds].sort())).toEqual([
      ["t-1"],
      ["t-1", "t-2"],
      ["t-1"],
    ]);
  });

  it("supports an anonymous (sender-less) registration; an unchanged union never re-pushes", () => {
    const { wiring, unions } = makeWiring();
    const a = fakeSender(1);
    wiring.setInterests(a.sender, interests(["t-1"]));
    // The anonymous registration joins as id 0 alongside window 1, so the
    // union is unchanged and nothing re-pushes.
    wiring.setInterests(null, EMPTY);
    expect(unions.map((entry) => entry.terminalThreadIds)).toEqual([["t-1"]]);
    wiring.releaseAll();
    expect(unions.map((entry) => entry.terminalThreadIds)).toEqual([["t-1"], []]);
  });

  it("reports union push failures through onError instead of rejecting", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const boom = new Error("synthetic push failure");
    const wiring = new RendererEventInterestsWiring({
      pushUnionInterests: async () => {
        throw boom;
      },
      onError,
    });
    const a = fakeSender(1);
    wiring.setInterests(a.sender, interests(["t-1"]));
    // The push is fire-and-forget; the rejection is contained.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledWith(boom);
  });
});
