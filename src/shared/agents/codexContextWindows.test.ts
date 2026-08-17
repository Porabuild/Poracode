import { describe, expect, it } from "vitest";
import {
  autoCompactTokenLimit,
  buildCodexContextSizeCapabilities,
  codexContextWindowOverrides,
  DEFAULT_CODEX_CONTEXT_SIZE,
  DEFAULT_CODEX_CONTEXT_WINDOWS,
  parseContextWindowInput,
  parseStoredContextWindows,
  resolveCodexContextWindows,
  resolveDefaultCodexContextSize,
  serializeContextWindows,
} from "./codexContextWindows";

describe("parseContextWindowInput", () => {
  it("parses k/m suffixes and raw token counts", () => {
    expect(parseContextWindowInput("272k")).toEqual({ id: "272k", label: "272k", tokens: 272_000 });
    expect(parseContextWindowInput("400K")).toEqual({ id: "400k", label: "400k", tokens: 400_000 });
    expect(parseContextWindowInput("1m")).toEqual({ id: "1m", label: "1M", tokens: 1_000_000 });
    expect(parseContextWindowInput("1.05M")).toEqual({
      id: "1.05m",
      label: "1.05M",
      tokens: 1_050_000,
    });
    expect(parseContextWindowInput("512000")).toEqual({
      id: "512k",
      label: "512k",
      tokens: 512_000,
    });
  });

  it("rejects empty, zero, and out-of-range values", () => {
    expect(parseContextWindowInput("")).toBeUndefined();
    expect(parseContextWindowInput("0k")).toBeUndefined();
    expect(parseContextWindowInput("12")).toBeUndefined();
    expect(parseContextWindowInput("20m")).toBeUndefined();
    expect(parseContextWindowInput("huge")).toBeUndefined();
  });
});

describe("stored Codex context windows", () => {
  it("falls back to 272k, 400k, and 1M", () => {
    expect(parseStoredContextWindows(undefined).map((window) => window.id)).toEqual([
      "272k",
      "400k",
      "1m",
    ]);
    expect(DEFAULT_CODEX_CONTEXT_WINDOWS.map((window) => window.id)).toEqual([
      "272k",
      "400k",
      "1m",
    ]);
  });

  it("dedupes, sorts, and round-trips custom values", () => {
    const windows = parseStoredContextWindows('["1m","512k","512000","272k"]');
    expect(windows.map((window) => window.id)).toEqual(["272k", "512k", "1m"]);
    expect(parseStoredContextWindows(serializeContextWindows(windows))).toEqual(windows);
  });

  it("reads the agent-settings key and keeps 400k as the default when present", () => {
    const windows = resolveCodexContextWindows({ contextWindows: '["1m","272k"]' });
    expect(windows.map((window) => window.id)).toEqual(["272k", "1m"]);
    expect(resolveDefaultCodexContextSize(windows)).toBe("272k");
    expect(resolveDefaultCodexContextSize(DEFAULT_CODEX_CONTEXT_WINDOWS)).toBe(
      DEFAULT_CODEX_CONTEXT_SIZE,
    );
  });
});

describe("Codex context-window launch overrides", () => {
  it("defaults to 400k with compaction at 95%", () => {
    expect(codexContextWindowOverrides()).toEqual({
      model_context_window: 400_000,
      model_auto_compact_token_limit: 380_000,
    });
    expect(codexContextWindowOverrides("1m")).toEqual({
      model_context_window: 1_000_000,
      model_auto_compact_token_limit: 950_000,
    });
    expect(autoCompactTokenLimit(272_000)).toBe(258_400);
  });
});

describe("buildCodexContextSizeCapabilities", () => {
  it("puts 400k first on every model so new drafts default to it", () => {
    const caps = buildCodexContextSizeCapabilities(
      ["gpt-5.6-sol", "gpt-5.6-terra"],
      DEFAULT_CODEX_CONTEXT_WINDOWS,
    );
    expect(caps.defaultContextSize).toBe("400k");
    expect(caps.contextSizes?.map((size) => size.id)).toEqual(["272k", "400k", "1m"]);
    expect(caps.modelContextSizes).toEqual({
      "gpt-5.6-sol": ["400k", "272k", "1m"],
      "gpt-5.6-terra": ["400k", "272k", "1m"],
    });
  });
});
