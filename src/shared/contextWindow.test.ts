import { describe, expect, it } from "vitest";
import {
  MAX_CONTEXT_WINDOW_TOKENS,
  MIN_CONTEXT_WINDOW_TOKENS,
  parseContextWindowTokens,
} from "./contextWindow";

describe("context window range", () => {
  it("exports the existing 1,000 through 10,000,000 token bounds", () => {
    expect(MIN_CONTEXT_WINDOW_TOKENS).toBe(1_000);
    expect(MAX_CONTEXT_WINDOW_TOKENS).toBe(10_000_000);
  });

  it("keeps the existing parser behavior at the bounds", () => {
    expect(parseContextWindowTokens("999")).toBeUndefined();
    expect(parseContextWindowTokens("1000")).toBe(MIN_CONTEXT_WINDOW_TOKENS);
    expect(parseContextWindowTokens("10m")).toBe(MAX_CONTEXT_WINDOW_TOKENS);
    expect(parseContextWindowTokens("10000001")).toBeUndefined();
  });
});
