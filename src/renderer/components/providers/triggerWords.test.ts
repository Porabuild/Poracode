import { describe, expect, it } from "vitest";
import "./claude";
import { getTriggerWords } from "./ProviderIcon";

function words(kind: string | undefined, model: string | undefined): string[] {
  return getTriggerWords(kind, model).map((d) => d.word);
}

describe("getTriggerWords", () => {
  it("leaves workflow as plain text for Claude models", () => {
    expect(words("claude", "claude-opus-4-8")).toEqual([]);
    expect(words("claude", "claude-fable-5")).toEqual([]);
    expect(words("claude", "claude-opus-4-7")).toEqual([]);
    expect(words("claude", "claude-opus-4-6")).toEqual([]);
    expect(words("claude", "sonnet")).toEqual([]);
    expect(words("claude", "haiku")).toEqual([]);
    expect(words("claude", undefined)).toEqual([]);
  });

  it("never enables trigger words for providers that opted into nothing", () => {
    expect(words("opencode", "claude-opus-4-8")).toEqual([]);
    expect(words("codex", "claude-opus-4-8")).toEqual([]);
    expect(words(undefined, "claude-opus-4-8")).toEqual([]);
  });
});
