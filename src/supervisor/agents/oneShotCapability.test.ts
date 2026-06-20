import { describe, expect, it } from "vitest";
import { createAgentRegistry } from "./registry";

/**
 * `AgentCapability.supportsOneShot` is declared statically per adapter but is
 * consumed by the renderer to hide interactive-only providers from the one-shot
 * AI settings selectors (Title / Commit Message generation). This test keeps the
 * static flag honest: it must agree with whether the adapter actually implements
 * a one-shot execution path (`runOneShot` or `buildOneShotCommand`). Otherwise a
 * provider could be offered for a one-shot task it then refuses to run, or
 * hidden despite being capable.
 */
describe("supportsOneShot capability", () => {
  const adapters = createAgentRegistry();

  it("covers every built-in adapter", () => {
    expect(adapters.length).toBeGreaterThan(0);
  });

  it.each(adapters.map((adapter) => [adapter.kind, adapter] as const))(
    "matches the actual one-shot execution path for %s",
    (_kind, adapter) => {
      const hasOneShotPath =
        typeof adapter.runOneShot === "function" ||
        typeof adapter.buildOneShotCommand === "function";
      expect(adapter.capabilities.supportsOneShot ?? false).toBe(hasOneShotPath);
    },
  );

  it("treats Grok as interactive-only (no one-shot path)", () => {
    const grok = adapters.find((adapter) => adapter.kind === "grok");
    expect(grok).toBeDefined();
    expect(grok?.capabilities.supportsOneShot ?? false).toBe(false);
  });
});
