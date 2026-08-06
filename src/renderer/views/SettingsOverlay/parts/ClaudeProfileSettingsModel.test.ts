import { describe, expect, it } from "vitest";
import type { AgentInstanceConfig } from "@/shared/contracts";
import {
  applyPresetEnvRows,
  cleanModels,
  DEEPSEEK_PRESET_ROWS,
  environmentFromRows,
  KIMI_CODE_PRESET_ROWS,
  MINIMAX_PRESET_ROWS,
  modelEffortsFromRows,
  modelsFromConfig,
  profileUsesExternalProvider,
  QWEN_TOKEN_PLAN_PRESET_ROWS,
  rowsFromEnvironment,
  ZAI_PRESET_ROWS,
  type EnvRow,
} from "./ClaudeProfileSettingsModel";

describe("ClaudeProfileSettingsModel", () => {
  it("round-trips an unchanged sealed secret even after the field enters replace mode", () => {
    const rows = rowsFromEnvironment(
      { ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true } },
      () => "row-1",
    );

    expect(environmentFromRows([{ ...rows[0]!, replacing: true }])).toEqual({
      ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true },
    });
  });

  it("uses typed secret replacements instead of the sealed placeholder", () => {
    const rows = rowsFromEnvironment(
      { ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true } },
      () => "row-1",
    );

    expect(environmentFromRows([{ ...rows[0]!, replacing: true, value: "sk-new" }])).toEqual({
      ANTHROPIC_AUTH_TOKEN: { value: "sk-new", sensitive: true },
    });
  });

  it("deduplicates custom model rows after trimming", () => {
    expect(
      cleanModels([
        { rowId: "1", id: " glm-5.2 ", label: " GLM 5.2 " },
        { rowId: "2", id: "glm-5.2", label: "Duplicate" },
        { rowId: "3", id: " ", label: "Ignored" },
      ]),
    ).toEqual([{ id: "glm-5.2", label: "GLM 5.2" }]);
  });

  it("hydrates explicit model efforts while other model rows inherit globally", () => {
    let counter = 0;
    const rows = modelsFromConfig(
      [{ id: "one" }, { id: "two" }, { id: "three" }],
      { one: ["high"], two: [] },
      () => `r${(counter += 1)}`,
    );

    expect(rows[0]?.efforts).toEqual(new Set(["high"]));
    expect(rows[1]?.efforts).toEqual(new Set());
    expect(rows[2]).not.toHaveProperty("efforts");
  });

  it("serializes only explicit per-model efforts within the global allow-list", () => {
    expect(
      modelEffortsFromRows(
        [
          { rowId: "1", id: " one ", label: "", efforts: new Set(["low", "max"]) },
          { rowId: "2", id: "two", label: "" },
          { rowId: "3", id: "three", label: "", efforts: new Set() },
        ],
        new Set(["low", "high"]),
      ),
    ).toEqual({ one: ["low"], three: [] });
  });

  it("does not mark an empty effort list as an external-provider override", () => {
    const instance: AgentInstanceConfig = {
      id: "work",
      driver: "claude",
      config: { configDir: "~/.poracode/claude-profiles/work" },
    };

    expect(profileUsesExternalProvider(instance, { configDir: "x", efforts: [] })).toBe(false);
  });

  describe("applyPresetEnvRows", () => {
    let counter = 0;
    const nextRowId = () => `r${(counter += 1)}`;

    it("adds the canonical z.ai env with 1M model ids and the auto-compact window", () => {
      const byKey = Object.fromEntries(
        applyPresetEnvRows(ZAI_PRESET_ROWS, [], nextRowId).map((row) => [row.key, row.value]),
      );
      expect(byKey.ANTHROPIC_BASE_URL).toBe("https://api.z.ai/api/anthropic");
      expect(byKey.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("glm-5.2[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("glm-5.2[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("glm-4.5-air");
      expect(byKey.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("1000000");
    });

    it("adds the canonical DeepSeek env with pro and flash models", () => {
      const byKey = Object.fromEntries(
        applyPresetEnvRows(DEEPSEEK_PRESET_ROWS, [], nextRowId).map((row) => [row.key, row.value]),
      );
      expect(byKey.ANTHROPIC_BASE_URL).toBe("https://api.deepseek.com/anthropic");
      expect(byKey.ANTHROPIC_MODEL).toBe("deepseek-v4-pro[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("deepseek-v4-pro[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("deepseek-v4-pro[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("deepseek-v4-flash");
      expect(byKey.CLAUDE_CODE_SUBAGENT_MODEL).toBe("deepseek-v4-flash");
      expect(byKey.CLAUDE_CODE_EFFORT_LEVEL).toBe("max");
    });

    it("adds the canonical MiniMax env with the M3 model and auto-compact window", () => {
      const byKey = Object.fromEntries(
        applyPresetEnvRows(MINIMAX_PRESET_ROWS, [], nextRowId).map((row) => [row.key, row.value]),
      );
      expect(byKey.ANTHROPIC_BASE_URL).toBe("https://api.minimax.io/anthropic");
      expect(byKey.ANTHROPIC_MODEL).toBe("MiniMax-M3");
      expect(byKey.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("MiniMax-M3");
      expect(byKey.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("MiniMax-M3");
      expect(byKey.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("MiniMax-M3");
      expect(byKey.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
      expect(byKey.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("512000");
    });

    it("adds the canonical Kimi Code membership env with K3 1M", () => {
      const byKey = Object.fromEntries(
        applyPresetEnvRows(KIMI_CODE_PRESET_ROWS, [], nextRowId).map((row) => [row.key, row.value]),
      );
      expect(byKey.ANTHROPIC_BASE_URL).toBe("https://api.kimi.com/coding/");
      expect(byKey.ANTHROPIC_API_KEY).toBe("");
      expect(byKey.ANTHROPIC_MODEL).toBe("k3[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe("k3[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("k3[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("k3[1m]");
      expect(byKey.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("k3[1m]");
      expect(byKey.CLAUDE_CODE_SUBAGENT_MODEL).toBe("k3[1m]");
      expect(byKey.CLAUDE_CODE_EFFORT_LEVEL).toBe("high");
      expect(byKey.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("1048576");
      expect(byKey.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe("1048576");
    });

    it("uses the distinct Alibaba Token Plan endpoint", () => {
      const byKey = Object.fromEntries(
        applyPresetEnvRows(QWEN_TOKEN_PLAN_PRESET_ROWS, [], nextRowId).map((row) => [
          row.key,
          row.value,
        ]),
      );
      expect(byKey.ANTHROPIC_BASE_URL).toBe(
        "https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic",
      );
      expect(byKey.ANTHROPIC_MODEL).toBe("qwen3.8-max");
      expect(byKey.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("qwen3.8-max");
      expect(byKey.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("qwen3.8-max");
      expect(byKey.ANTHROPIC_DEFAULT_FABLE_MODEL).toBeUndefined();
      expect(byKey.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("qwen3.6-flash");
      expect(byKey.CLAUDE_CODE_SUBAGENT_MODEL).toBe("qwen3.7-max");
      expect(byKey.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe("983616");
    });

    it("moves the old Kimi preset token to the Kimi Code API key variable", () => {
      const rows: EnvRow[] = [
        {
          rowId: "auth-token",
          key: "ANTHROPIC_AUTH_TOKEN",
          value: "lc-safe:v1:sealed",
          sensitive: true,
          sealed: "lc-safe:v1:sealed",
          replacing: false,
        },
      ];

      const result = applyPresetEnvRows(
        KIMI_CODE_PRESET_ROWS,
        rows,
        nextRowId,
        ["ANTHROPIC_AUTH_TOKEN"],
        { ANTHROPIC_API_KEY: ["ANTHROPIC_AUTH_TOKEN"] },
      );
      expect(result.some((row) => row.key === "ANTHROPIC_AUTH_TOKEN")).toBe(false);
      expect(result.find((row) => row.key === "ANTHROPIC_API_KEY")).toMatchObject({
        value: "lc-safe:v1:sealed",
        sealed: "lc-safe:v1:sealed",
        sensitive: true,
      });
    });

    it("corrects stale preset values but keeps an existing token and extra rows", () => {
      const existing: EnvRow[] = [
        {
          rowId: "a",
          key: "ANTHROPIC_DEFAULT_OPUS_MODEL",
          value: "glm-5.2",
          sensitive: false,
          replacing: false,
        },
        {
          rowId: "b",
          key: "ANTHROPIC_AUTH_TOKEN",
          value: "lc-safe:v1:sealed",
          sensitive: true,
          sealed: "lc-safe:v1:sealed",
          replacing: false,
        },
        { rowId: "c", key: "MY_CUSTOM", value: "keep", sensitive: false, replacing: false },
      ];
      const byKey = new Map(
        applyPresetEnvRows(ZAI_PRESET_ROWS, existing, nextRowId).map((r) => [r.key, r]),
      );

      expect(byKey.get("ANTHROPIC_DEFAULT_OPUS_MODEL")?.value).toBe("glm-5.2[1m]");
      expect(byKey.get("ANTHROPIC_AUTH_TOKEN")?.value).toBe("lc-safe:v1:sealed");
      expect(byKey.get("MY_CUSTOM")?.value).toBe("keep");
    });
  });
});
// @vitest-environment node
