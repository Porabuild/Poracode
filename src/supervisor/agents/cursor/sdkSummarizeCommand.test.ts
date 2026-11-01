import { describe, expect, it } from "vitest";
import { isCursorSdkSummarizeCommand } from "./sdkSummarizeCommand";

describe("isCursorSdkSummarizeCommand", () => {
  it("matches only the bare command", () => {
    expect(isCursorSdkSummarizeCommand("/summarize")).toBe(true);
    expect(isCursorSdkSummarizeCommand("  /summarize \n")).toBe(true);
    expect(isCursorSdkSummarizeCommand("/summarize keep the API notes")).toBe(false);
    expect(isCursorSdkSummarizeCommand("/summarizing")).toBe(false);
    expect(isCursorSdkSummarizeCommand("please /summarize")).toBe(false);
    expect(isCursorSdkSummarizeCommand("")).toBe(false);
  });
});
