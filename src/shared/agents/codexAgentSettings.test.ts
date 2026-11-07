import { describe, expect, it } from "vitest";
import {
  codexAgentSettingOverrideArgs,
  codexVersionSupportsAgentsConfig,
  parseMaxSubagents,
  resolveCodexAgentSettings,
} from "./codexAgentSettings";

describe("resolveCodexAgentSettings", () => {
  it("returns nothing for missing or empty settings", () => {
    expect(resolveCodexAgentSettings(undefined)).toEqual({});
    expect(resolveCodexAgentSettings({ subagentModel: "  ", maxSubagents: "" })).toEqual({});
  });

  it("reads trimmed values", () => {
    expect(
      resolveCodexAgentSettings({
        subagentModel: " gpt-6-luna ",
        subagentReasoningEffort: "max",
        maxSubagents: "10",
        planModeReasoningEffort: "high",
      }),
    ).toEqual({
      subagentModel: "gpt-6-luna",
      subagentReasoningEffort: "max",
      maxSubagents: 10,
      planModeReasoningEffort: "high",
    });
  });

  it("drops values that could break out of a TOML override", () => {
    expect(
      resolveCodexAgentSettings({
        subagentModel: 'x"\n[evil]',
        subagentReasoningEffort: 'max" # ',
        planModeReasoningEffort: "High",
        maxSubagents: "1e3",
      }),
    ).toEqual({});
  });

  it.each(["true", "false", "inf", "nan", "1e3", "5", "0x1f", "_x"])(
    "rejects %j, which could parse as a non-string TOML value",
    (value) => {
      expect(
        resolveCodexAgentSettings({ subagentModel: value, subagentReasoningEffort: value }),
      ).toEqual({});
    },
  );

  it("ignores non-string stored values", () => {
    expect(resolveCodexAgentSettings({ subagentModel: true })).toEqual({});
  });
});

describe("parseMaxSubagents", () => {
  it("accepts whole numbers within the limit", () => {
    expect(parseMaxSubagents("1")).toBe(1);
    expect(parseMaxSubagents(" 64 ")).toBe(64);
  });

  it.each(["", "0", "65", "-1", "2.5", "abc"])("rejects %j", (raw) => {
    expect(parseMaxSubagents(raw)).toBeUndefined();
  });
});

describe("codexAgentSettingOverrideArgs", () => {
  it("emits no args by default", () => {
    expect(codexAgentSettingOverrideArgs(undefined, true)).toEqual([]);
  });

  it("maps every setting to its Codex config key", () => {
    expect(
      codexAgentSettingOverrideArgs(
        {
          subagentModel: "gpt-6-luna",
          subagentReasoningEffort: "max",
          maxSubagents: "10",
          planModeReasoningEffort: "high",
        },
        true,
      ),
    ).toEqual([
      "-c",
      'agents.default_subagent_model="gpt-6-luna"',
      "-c",
      'agents.default_subagent_reasoning_effort="max"',
      "-c",
      "agents.max_concurrent_threads_per_session=10",
      "-c",
      'plan_mode_reasoning_effort="high"',
    ]);
  });

  it("omits the agents.* keys for a CLI that would reject them, keeping the rest", () => {
    expect(
      codexAgentSettingOverrideArgs(
        {
          subagentModel: "gpt-6-luna",
          subagentReasoningEffort: "max",
          maxSubagents: "10",
          planModeReasoningEffort: "high",
        },
        false,
      ),
    ).toEqual(["-c", 'plan_mode_reasoning_effort="high"']);
  });
});

describe("codexVersionSupportsAgentsConfig", () => {
  it.each(["0.145.0", "0.145.3", "0.146.0-alpha.1", "0.165.0", "1.0.0", "codex-cli 0.165.0"])(
    "accepts %j",
    (version) => {
      expect(codexVersionSupportsAgentsConfig(version)).toBe(true);
    },
  );

  it.each(["0.144.9", "0.9.0", "0.145.0-alpha.3", "codex-cli 0.144.0", "garbage", "", undefined])(
    "treats %j as unsupported",
    (version) => {
      expect(codexVersionSupportsAgentsConfig(version)).toBe(false);
    },
  );
});
