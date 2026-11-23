import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_AGENT_SETTING_DEFAULTS,
  DEEPSEEK_APPLY_PATCH_SETTING_KEY,
  DEEPSEEK_CODE_MODE_SETTING_KEY,
  DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY,
  DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY,
  DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY,
  DEEPSEEK_OFFICE_TOOLS_SETTING_KEY,
  DEEPSEEK_RALPH_LOOP_SETTING_KEY,
  DEEPSEEK_READ_BEFORE_EDIT_SETTING_KEY,
  DEEPSEEK_SESSION_SEARCH_SETTING_KEY,
  DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY,
  DEEPSEEK_SUBAGENT_INTERRUPT_SETTING_KEY,
  DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY,
  DEEPSEEK_WEB_BILLING_SETTING_KEY,
  DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY,
  DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY,
  DEEPSEEK_WEB_SEARCH_PROVIDER_SETTING_KEY,
  hasDeepSeekAgentSettingOverrides,
  parseDeepSeekIntSetting,
  resolveDeepSeekAgentSettings,
} from "./deepseekAgentSettings";

describe("deepseekAgentSettings", () => {
  it("resolves defaults when no settings are stored", () => {
    expect(resolveDeepSeekAgentSettings()).toEqual({
      codeMode: false,
      applyPatch: false,
      readBeforeEdit: false,
      sessionSearch: false,
      ralphLoop: false,
      officeTools: false,
      subagentInterrupt: false,
      uploadSessionLog: true,
    });
    expect(hasDeepSeekAgentSettingOverrides()).toBe(false);
    expect(hasDeepSeekAgentSettingOverrides({})).toBe(false);
    expect(hasDeepSeekAgentSettingOverrides({ ...DEEPSEEK_AGENT_SETTING_DEFAULTS })).toBe(false);
  });

  it("normalizes default-equivalent enum values (http, auto) to unset", () => {
    const defaultEnums = {
      [DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY]: "http",
      [DEEPSEEK_WEB_BILLING_SETTING_KEY]: "auto",
    };
    expect(resolveDeepSeekAgentSettings(defaultEnums)).toEqual({
      codeMode: false,
      applyPatch: false,
      readBeforeEdit: false,
      sessionSearch: false,
      ralphLoop: false,
      officeTools: false,
      subagentInterrupt: false,
      uploadSessionLog: true,
    });
    expect(hasDeepSeekAgentSettingOverrides(defaultEnums)).toBe(false);
  });

  it("parses valid enums, booleans, and bounded integer limits", () => {
    const raw = {
      [DEEPSEEK_CODE_MODE_SETTING_KEY]: true,
      [DEEPSEEK_APPLY_PATCH_SETTING_KEY]: true,
      [DEEPSEEK_READ_BEFORE_EDIT_SETTING_KEY]: true,
      [DEEPSEEK_SESSION_SEARCH_SETTING_KEY]: true,
      [DEEPSEEK_RALPH_LOOP_SETTING_KEY]: true,
      [DEEPSEEK_OFFICE_TOOLS_SETTING_KEY]: true,
      [DEEPSEEK_SUBAGENT_INTERRUPT_SETTING_KEY]: true,
      [DEEPSEEK_WEB_SEARCH_PROVIDER_SETTING_KEY]: " deepseek-search-api ",
      [DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY]: "deepseek-fetch-api",
      [DEEPSEEK_WEB_BILLING_SETTING_KEY]: "api-key",
      [DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY]: "25",
      [DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY]: "0",
      [DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY]: "16",
      [DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY]: "12",
      [DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY]: "120",
      [DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY]: false,
    };

    expect(resolveDeepSeekAgentSettings(raw)).toEqual({
      codeMode: true,
      applyPatch: true,
      readBeforeEdit: true,
      sessionSearch: true,
      ralphLoop: true,
      officeTools: true,
      subagentInterrupt: true,
      webSearchProvider: "deepseek-search-api",
      webFetchProvider: "deepseek-fetch-api",
      webBilling: "api-key",
      webSearchCount: 25,
      maxSubagentDepth: 0,
      maxActiveSubagents: 16,
      maxParallelToolCalls: 12,
      shellTimeoutSeconds: 120,
      uploadSessionLog: false,
    });
    expect(hasDeepSeekAgentSettingOverrides(raw)).toBe(true);
  });

  it("ignores invalid enum values, non-numeric strings, and out-of-range numbers", () => {
    const invalid = {
      [DEEPSEEK_CODE_MODE_SETTING_KEY]: "true",
      [DEEPSEEK_WEB_SEARCH_PROVIDER_SETTING_KEY]: "google",
      [DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY]: "curl",
      [DEEPSEEK_WEB_BILLING_SETTING_KEY]: "free",
      [DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY]: "0",
      [DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY]: "-1",
      [DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY]: "65",
      [DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY]: "3.5",
      [DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY]: "4",
      [DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY]: "false",
    };

    expect(resolveDeepSeekAgentSettings(invalid)).toEqual({
      codeMode: false,
      applyPatch: false,
      readBeforeEdit: false,
      sessionSearch: false,
      ralphLoop: false,
      officeTools: false,
      subagentInterrupt: false,
      uploadSessionLog: true,
    });
    expect(hasDeepSeekAgentSettingOverrides(invalid)).toBe(false);
  });

  it("enforces exact integer bounds on every key", () => {
    expect(parseDeepSeekIntSetting(DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY, "1")).toBe(1);
    expect(parseDeepSeekIntSetting(DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY, "50")).toBe(50);
    expect(parseDeepSeekIntSetting(DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY, "0")).toBeUndefined();
    expect(parseDeepSeekIntSetting(DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY, "51")).toBeUndefined();

    expect(parseDeepSeekIntSetting(DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY, "0")).toBe(0);
    expect(parseDeepSeekIntSetting(DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY, "16")).toBe(16);
    expect(parseDeepSeekIntSetting(DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY, "17")).toBeUndefined();

    expect(parseDeepSeekIntSetting(DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY, "1")).toBe(1);
    expect(parseDeepSeekIntSetting(DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY, "64")).toBe(64);
    expect(parseDeepSeekIntSetting(DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY, "0")).toBeUndefined();
    expect(
      parseDeepSeekIntSetting(DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY, "65"),
    ).toBeUndefined();

    expect(parseDeepSeekIntSetting(DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY, "1")).toBe(1);
    expect(parseDeepSeekIntSetting(DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY, "64")).toBe(64);
    expect(
      parseDeepSeekIntSetting(DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY, "0"),
    ).toBeUndefined();
    expect(
      parseDeepSeekIntSetting(DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY, "65"),
    ).toBeUndefined();

    expect(parseDeepSeekIntSetting(DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY, "5")).toBe(5);
    expect(parseDeepSeekIntSetting(DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY, "600")).toBe(600);
    expect(
      parseDeepSeekIntSetting(DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY, "4"),
    ).toBeUndefined();
    expect(
      parseDeepSeekIntSetting(DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY, "601"),
    ).toBeUndefined();
  });

  it("treats disabling uploadSessionLog as an override", () => {
    expect(
      hasDeepSeekAgentSettingOverrides({
        [DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY]: false,
      }),
    ).toBe(true);
    expect(
      hasDeepSeekAgentSettingOverrides({
        [DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY]: true,
      }),
    ).toBe(false);
  });
});
