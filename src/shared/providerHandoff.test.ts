import { describe, expect, it } from "vitest";
import { resolveProviderHandoffStrategy, targetGuaranteesReadThreadTool } from "./providerHandoff";

const reachable = {
  isMirroredThread: false,
  readThreadToolEnabled: true,
  threadResolvedReadThreadTool: true,
  targetReadThreadToolGuaranteed: true,
};

describe("resolveProviderHandoffStrategy", () => {
  it("hands chat → chat the thread itself, for a switch and for a fork alike", () => {
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

  it("writes a context file when the target cannot guarantee its MCP set", () => {
    expect(
      resolveProviderHandoffStrategy({
        ...reachable,
        targetReadThreadToolGuaranteed: false,
        sourcePresentationMode: "gui",
        targetPresentationMode: "gui",
      }),
    ).toBe("context-file");
  });
});

describe("targetGuaranteesReadThreadTool", () => {
  it("trusts a chat target that bakes or rebuilds its MCP set", () => {
    expect(targetGuaranteesReadThreadTool({ mcpScope: { gui: "launch" } }, "gui")).toBe(true);
    expect(targetGuaranteesReadThreadTool({ mcpScope: { gui: "always" } }, "gui")).toBe(true);
    // Absent scope falls back to the generic structured-runtime behavior.
    expect(targetGuaranteesReadThreadTool({}, "gui")).toBe(true);
  });

  it("rejects a target whose runtime has no MCP wiring", () => {
    expect(targetGuaranteesReadThreadTool({ mcpScope: { gui: "none" } }, "gui")).toBe(false);
    expect(targetGuaranteesReadThreadTool({ mcpScope: { terminal: "none" } }, "terminal")).toBe(
      false,
    );
  });

  it("trusts a provider that owns its MCP config even though its composer scope is none", () => {
    // The composer has nothing to toggle for such a provider, so it declares
    // "none" — but the supervisor still resolves the built-in servers for it
    // from its settings page, so `read_thread` is reachable.
    expect(
      targetGuaranteesReadThreadTool(
        { mcpScope: { terminal: "none", gui: "none" }, mcpConfigSource: "agentSettings" },
        "gui",
      ),
    ).toBe(true);
  });
});
