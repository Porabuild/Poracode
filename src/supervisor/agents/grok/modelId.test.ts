import { describe, expect, it } from "vitest";
import {
  canonicalGrokModelId,
  grokFastVariantId,
  grokStandardModelId,
  isGrokBuildFastModelId,
  normalizeGrokModelConfig,
} from "./modelId";

describe("grok fast model ids", () => {
  it("recognizes only the build-fast sibling suffix", () => {
    expect(isGrokBuildFastModelId("grok-4.7-build-fast")).toBe(true);
    expect(isGrokBuildFastModelId("grok-4.7")).toBe(false);
    expect(isGrokBuildFastModelId("grok-4.7-fast")).toBe(false);
    expect(grokStandardModelId("grok-4.7-build-fast")).toBe("grok-4.7");
    expect(grokFastVariantId("grok-4.7")).toBe("grok-4.7-build-fast");
    expect(grokFastVariantId("grok-4.7-build-fast")).toBe("grok-4.7-build-fast");
  });

  it("canonicalizes a fast sibling only when the standard model is advertised", () => {
    const models = [{ id: "grok-4.7" }, { id: "grok-4.6" }];
    expect(canonicalGrokModelId("grok-4.7-build-fast", models)).toBe("grok-4.7");
    expect(canonicalGrokModelId("custom-build-fast", models)).toBe("custom-build-fast");
    expect(canonicalGrokModelId("grok-4.7", models)).toBe("grok-4.7");
  });

  it("lifts a saved fast sibling onto the Fast toggle", () => {
    const models = [{ id: "grok-4.7" }];
    expect(normalizeGrokModelConfig({ model: "grok-4.7-build-fast" }, models)).toEqual({
      model: "grok-4.7",
      fast: true,
    });
    expect(normalizeGrokModelConfig({ model: "grok-4.7-build-fast", fast: false }, models)).toEqual(
      { model: "grok-4.7", fast: false },
    );
    expect(normalizeGrokModelConfig({ model: "grok-4.7", fast: false }, models)).toEqual({
      model: "grok-4.7",
      fast: false,
    });
  });
});
