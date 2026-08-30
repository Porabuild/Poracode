import { describe, expect, it } from "vitest";
import { resolveProviderHandoffStrategy } from "./providerHandoff";

const reachable = {
  intent: "switch" as const,
  isMirroredThread: false,
  readThreadToolEnabled: true,
  threadResolvedReadThreadTool: true,
};

describe("resolveProviderHandoffStrategy", () => {
  it("hands chat → chat the thread itself", () => {
    expect(
      resolveProviderHandoffStrategy({
        ...reachable,
        sourcePresentationMode: "gui",
        targetPresentationMode: "gui",
      }),
    ).toBe("thread-transcript");
  });

  it.each([
    ["chat → cli", "gui", "terminal"],
    ["cli → cli", "terminal", "terminal"],
    ["cli → chat", "terminal", "gui"],
  ] as const)("writes a context file for %s", (_label, source, target) => {
    expect(
      resolveProviderHandoffStrategy({
        ...reachable,
        sourcePresentationMode: source,
        targetPresentationMode: target,
      }),
    ).toBe("context-file");
  });

  it("writes a context file for a fork, which lands in a thread of its own", () => {
    expect(
      resolveProviderHandoffStrategy({
        ...reachable,
        intent: "fork",
        sourcePresentationMode: "gui",
        targetPresentationMode: "gui",
      }),
    ).toBe("context-file");
  });

  it("writes a context file for a mirrored thread, whose transcript lives on its host", () => {
    expect(
      resolveProviderHandoffStrategy({
        ...reachable,
        isMirroredThread: true,
        sourcePresentationMode: "gui",
        targetPresentationMode: "gui",
      }),
    ).toBe("context-file");
  });

  it("writes a context file when read_thread is disabled in settings", () => {
    expect(
      resolveProviderHandoffStrategy({
        ...reachable,
        readThreadToolEnabled: false,
        sourcePresentationMode: "gui",
        targetPresentationMode: "gui",
      }),
    ).toBe("context-file");
  });

  it("writes a context file when the thread's own session never resolved read_thread", () => {
    expect(
      resolveProviderHandoffStrategy({
        ...reachable,
        threadResolvedReadThreadTool: false,
        sourcePresentationMode: "gui",
        targetPresentationMode: "gui",
      }),
    ).toBe("context-file");
  });
});
