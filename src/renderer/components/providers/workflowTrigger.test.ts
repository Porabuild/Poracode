import { describe, expect, it } from "vitest";
import "./claude";
import { supportsWorkflowTrigger } from "./ProviderIcon";

describe("supportsWorkflowTrigger", () => {
  it("enables the workflow chip only for Claude Opus 4.7 / 4.8", () => {
    expect(supportsWorkflowTrigger("claude", "claude-opus-4-8")).toBe(true);
    expect(supportsWorkflowTrigger("claude", "claude-opus-4-7")).toBe(true);
  });

  it("leaves the word as plain text for other Claude models", () => {
    expect(supportsWorkflowTrigger("claude", "claude-opus-4-6")).toBe(false);
    expect(supportsWorkflowTrigger("claude", "sonnet")).toBe(false);
    expect(supportsWorkflowTrigger("claude", "haiku")).toBe(false);
    expect(supportsWorkflowTrigger("claude", undefined)).toBe(false);
  });

  it("never enables the chip for providers without workflow orchestration", () => {
    expect(supportsWorkflowTrigger("opencode", "claude-opus-4-8")).toBe(false);
    expect(supportsWorkflowTrigger("codex", "claude-opus-4-8")).toBe(false);
    expect(supportsWorkflowTrigger(undefined, "claude-opus-4-8")).toBe(false);
  });
});
