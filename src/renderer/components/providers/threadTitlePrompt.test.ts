// @vitest-environment node

import { describe, expect, it } from "vitest";
import { registerThreadTitlePrompt, resolveThreadTitlePrompt } from "./threadTitlePrompt";

describe("thread title prompt registry", () => {
  registerThreadTitlePrompt("fixture-title-agent", (prompt) =>
    prompt.startsWith("/start ") ? prompt.slice("/start ".length) : undefined,
  );

  it("uses the provider-resolved text, including for instance-scoped kinds", () => {
    expect(resolveThreadTitlePrompt("fixture-title-agent", "/start Build it")).toBe("Build it");
    expect(resolveThreadTitlePrompt("fixture-title-agent:work", "/start Build it")).toBe(
      "Build it",
    );
  });

  it("falls back to the prompt when no provider resolves one", () => {
    expect(resolveThreadTitlePrompt("fixture-title-agent", "plain")).toBe("plain");
    expect(resolveThreadTitlePrompt("fixture-title-agent", "/start   ")).toBe("/start   ");
    expect(resolveThreadTitlePrompt("unregistered-agent", "/start Build it")).toBe(
      "/start Build it",
    );
  });
});
