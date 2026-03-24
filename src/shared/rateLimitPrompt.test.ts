import { describe, expect, it } from "vitest";
import { detectRateLimitPrompt } from "./rateLimitPrompt";

describe("detectRateLimitPrompt", () => {
  const SAMPLE_TEXT = [
    "Approaching rate limits",
    "Switch to gpt-5.1-codex-mini for lower credit usage?",
    "",
    "> 1. Switch to gpt-5.1-codex-mini       Optimized for codex. Cheaper, faster, but less capable.",
    "  2. Keep current model",
    "  3. Keep current model (never show again)  Hide future rate limit reminders about switching models.",
    "",
    "Press enter to confirm or esc to go back",
  ].join("\n");

  it("detects the prompt and extracts the suggested model", () => {
    const info = detectRateLimitPrompt(SAMPLE_TEXT);
    expect(info).not.toBeNull();
    expect(info!.suggestedModel).toBe("gpt-5.1-codex-mini");
  });

  it("extracts all three options with labels and descriptions", () => {
    const info = detectRateLimitPrompt(SAMPLE_TEXT)!;
    expect(info.options).toHaveLength(3);

    expect(info.options[0]).toEqual({
      index: 0,
      label: "Switch to gpt-5.1-codex-mini",
      description: "Optimized for codex. Cheaper, faster, but less capable.",
    });

    expect(info.options[1]).toEqual({
      index: 1,
      label: "Keep current model",
      description: "",
    });

    expect(info.options[2]).toEqual({
      index: 2,
      label: "Keep current model (never show again)",
      description: "Hide future rate limit reminders about switching models.",
    });
  });

  it("returns null for unrelated text", () => {
    expect(detectRateLimitPrompt("hello world")).toBeNull();
  });

  it("returns null when header present but no model line", () => {
    expect(detectRateLimitPrompt("Approaching rate limits\nSomething else")).toBeNull();
  });

  it("returns null when header and model present but no options", () => {
    const text = "Approaching rate limits\nSwitch to gpt-5.1-codex-mini for lower credit usage?";
    expect(detectRateLimitPrompt(text)).toBeNull();
  });

  it("handles different model names", () => {
    const text = SAMPLE_TEXT.replace(/gpt-5\.1-codex-mini/g, "gpt-5.4-mini");
    const info = detectRateLimitPrompt(text);
    expect(info).not.toBeNull();
    expect(info!.suggestedModel).toBe("gpt-5.4-mini");
  });

  it("handles non-ASCII indicator characters like ❯", () => {
    const text = SAMPLE_TEXT.replace("> 1.", "❯ 1.");
    const info = detectRateLimitPrompt(text);
    expect(info).not.toBeNull();
    expect(info!.options).toHaveLength(3);
    expect(info!.options[0]!.label).toBe("Switch to gpt-5.1-codex-mini");
  });

  it("handles indicator on a separate line from the number", () => {
    const text = [
      "Approaching rate limits",
      "Switch to gpt-5.1-codex-mini for lower credit usage?",
      "",
      ">",
      "1. Switch to gpt-5.1-codex-mini       Optimized for codex.",
      "  2. Keep current model",
      "  3. Keep current model (never show again)",
    ].join("\n");
    const info = detectRateLimitPrompt(text);
    expect(info).not.toBeNull();
    expect(info!.options).toHaveLength(3);
  });
});
