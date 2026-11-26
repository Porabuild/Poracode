import { describe, expect, it } from "vitest";
import {
  appendOllamaPullOutput,
  buildOllamaModelPullScript,
  isValidOllamaLibraryTag,
  ollamaPullPercent,
} from "./ollamaModelPull";

describe("ollamaModelPull validation", () => {
  it.each([
    "llama3.2:3b",
    "qwen3-coder:30b",
    "library/llama3.2:latest",
    "registry.example.com/ns/model:tag-1",
  ])("accepts bounded library tag %s", (tag) => {
    expect(isValidOllamaLibraryTag(tag)).toBe(true);
  });

  it.each([
    "",
    "kimi:cloud",
    "model-cloud",
    "model:cloud",
    "model;rm -rf /",
    "model --help",
    "model$(id)",
    "Model",
    "-bad",
    "model\nnext",
    `m${"e".repeat(220)}`,
  ])("rejects unsafe or cloud tag %s", (tag) => {
    expect(isValidOllamaLibraryTag(tag)).toBe(false);
  });
});

describe("buildOllamaModelPullScript", () => {
  it("pins the loopback Ollama host and quotes the posix tag as a literal", () => {
    const script = buildOllamaModelPullScript("qwen3-coder:30b", "posix");
    expect(script).toContain("OLLAMA_HOST='127.0.0.1:11434'");
    expect(script).toContain("ollama pull 'qwen3-coder:30b'");
    expect(script).not.toContain("${");
  });

  it("pins the loopback Ollama host and quotes the windows tag as a literal", () => {
    const script = buildOllamaModelPullScript("llama3.2:3b", "windows");
    expect(script).toContain("$env:OLLAMA_HOST = '127.0.0.1:11434'");
    expect(script).toContain("ollama pull 'llama3.2:3b'");
  });
});

describe("ollama pull progress text", () => {
  it("preserves chunk boundaries and reads the latest percent", () => {
    let output = "";
    output = appendOllamaPullOutput(output, "pulling manifest\n");
    output = appendOllamaPullOutput(output, "50%");
    expect(output).toBe("pulling manifest\n50%");
    expect(ollamaPullPercent(output)).toBe(50);
  });

  it("normalizes carriage-return progress without gluing chunks", () => {
    let output = appendOllamaPullOutput("", "pulling digest\r");
    output = appendOllamaPullOutput(output, "42%");
    expect(output).toBe("pulling digest\n42%");
    expect(ollamaPullPercent(output)).toBe(42);
  });

  it("bounds retained output bytes", () => {
    const output = appendOllamaPullOutput("", "x".repeat(5000));
    expect(output).toHaveLength(4096);
  });
});
