import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_RENDERER_EVENT_INTERESTS,
  RendererEventInterestRegistry,
  type RendererEventSender,
} from "./rendererEventInterestRegistry";

function fakeSender(id: number): {
  sender: RendererEventSender;
  destroy(): void;
  listenerCount(): number;
} {
  const destroyedListeners: Array<() => void> = [];
  return {
    listenerCount: () => destroyedListeners.length,
    sender: {
      id,
      once: (channel, listener) => {
        if (channel === "destroyed") destroyedListeners.push(listener);
      },
    },
    destroy: () => {
      for (const listener of destroyedListeners) listener();
    },
  };
}

describe("RendererEventInterestRegistry", () => {
  it("keeps one destruction listener when a surviving window repeatedly reloads", () => {
    const registry = new RendererEventInterestRegistry(() => {});
    const first = fakeSender(1);
    for (let reload = 0; reload < 20; reload += 1) {
      registry.set(first.sender, {
        terminalThreadIds: [`terminal-${reload}`],
        runtimeThreadIds: [],
        allRuntimeEvents: false,
      });
      if (reload < 19) registry.release(first.sender.id);
    }
    expect(first.listenerCount()).toBe(1);
    first.destroy();
    expect(registry.snapshot()).toEqual(EMPTY_RENDERER_EVENT_INTERESTS);
  });
  it("routes the union of every registered window to the host", () => {
    const onChange = vi.fn<(interests: unknown) => void>();
    const registry = new RendererEventInterestRegistry(onChange);
    const first = fakeSender(1);
    const second = fakeSender(2);

    registry.set(first.sender, {
      terminalThreadIds: ["t1"],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    registry.set(second.sender, {
      terminalThreadIds: ["t1", "t2"],
      runtimeThreadIds: ["r1"],
      allRuntimeEvents: true,
    });

    expect(registry.snapshot()).toEqual({
      terminalThreadIds: ["t1", "t2"],
      runtimeThreadIds: ["r1"],
      allRuntimeEvents: true,
    });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("releases a window's interests when its webContents is destroyed", () => {
    const onChange = vi.fn<(interests: unknown) => void>();
    const registry = new RendererEventInterestRegistry(onChange);
    const first = fakeSender(1);
    const second = fakeSender(2);

    registry.set(first.sender, {
      terminalThreadIds: ["t1"],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    registry.set(second.sender, {
      terminalThreadIds: [],
      runtimeThreadIds: ["r2"],
      allRuntimeEvents: false,
    });
    first.destroy();

    expect(registry.snapshot()).toEqual({
      terminalThreadIds: [],
      runtimeThreadIds: ["r2"],
      allRuntimeEvents: false,
    });
    second.destroy();
    expect(registry.snapshot()).toEqual(EMPTY_RENDERER_EVENT_INTERESTS);
  });

  it("does not notify when an update leaves the union unchanged", () => {
    const onChange = vi.fn<(interests: unknown) => void>();
    const registry = new RendererEventInterestRegistry(onChange);
    const sender = fakeSender(1);
    registry.set(sender.sender, {
      terminalThreadIds: ["t1"],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    onChange.mockClear();

    registry.set(sender.sender, {
      terminalThreadIds: ["t1"],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    expect(onChange).not.toHaveBeenCalled();

    registry.release(42);
    expect(onChange).not.toHaveBeenCalled();
  });
});
