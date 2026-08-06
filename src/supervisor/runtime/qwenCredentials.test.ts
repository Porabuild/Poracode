import { describe, expect, it } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import {
  parseQwenClaudeProfiles,
  parseQwenUsageEnv,
  parseQwenUsageSettings,
} from "./qwenCredentials";

describe("parseQwenUsageEnv", () => {
  it("prefers the explicit Alibaba key and carries region/endpoint metadata", () => {
    expect(
      parseQwenUsageEnv({
        ALIBABA_CODING_PLAN_API_KEY: ' "coding-key" ',
        BAILIAN_CODING_PLAN_API_KEY: "bailian-key",
        ALIBABA_CODING_PLAN_REGION: "Singapore",
        ALIBABA_CODING_PLAN_QUOTA_URL: "https://quota.example.test/usage",
      }),
    ).toEqual({
      accessToken: "coding-key",
      raw: { region: "intl", quotaUrl: "https://quota.example.test/usage" },
    });
  });

  it("supports Qwen Code's native key name and the DashScope alias", () => {
    expect(parseQwenUsageEnv({ BAILIAN_CODING_PLAN_API_KEY: "qwen-key" })).toEqual({
      accessToken: "qwen-key",
    });
    expect(parseQwenUsageEnv({ DASHSCOPE_API_KEY: "dashscope-key" })).toEqual({
      accessToken: "dashscope-key",
    });
    expect(parseQwenUsageEnv({ BAILIAN_TOKEN_PLAN_API_KEY: "token-plan-key" })).toEqual({
      accessToken: "token-plan-key",
    });
  });
});

describe("parseQwenUsageSettings", () => {
  it("reads Qwen /auth settings and infers the mainland region from the selected model", () => {
    expect(
      parseQwenUsageSettings(
        JSON.stringify({
          env: { BAILIAN_CODING_PLAN_API_KEY: "qwen-key" },
          model: { name: "qwen3.8-max-preview" },
          modelProviders: {
            openai: {
              protocol: "openai",
              models: [
                {
                  id: "qwen3.8-max-preview",
                  baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
                  envKey: "BAILIAN_CODING_PLAN_API_KEY",
                },
              ],
            },
          },
        }),
      ),
    ).toEqual({ accessToken: "qwen-key", raw: { region: "cn" } });
  });

  it("keeps compatibility with Qwen Code's legacy provider array", () => {
    expect(
      parseQwenUsageSettings(
        JSON.stringify({
          env: { BAILIAN_CODING_PLAN_API_KEY: "qwen-key" },
          model: { name: "qwen3.7-plus" },
          modelProviders: {
            openai: [
              {
                id: "qwen3.7-plus",
                baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1",
              },
            ],
          },
        }),
      ),
    ).toEqual({ accessToken: "qwen-key", raw: { region: "intl" } });
  });

  it("reads the current international Token Plan settings", () => {
    expect(
      parseQwenUsageSettings(
        JSON.stringify({
          env: { BAILIAN_TOKEN_PLAN_API_KEY: "token-plan-key" },
          model: { name: "qwen3.8-max-preview" },
          modelProviders: {
            openai: [
              {
                id: "qwen3.8-max-preview",
                baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
                envKey: "BAILIAN_TOKEN_PLAN_API_KEY",
              },
            ],
          },
        }),
      ),
    ).toEqual({ accessToken: "token-plan-key", raw: { region: "intl" } });
  });

  it("recognizes the international Coding Plan endpoint and rejects malformed settings", () => {
    expect(
      parseQwenUsageSettings(
        JSON.stringify({
          env: { BAILIAN_CODING_PLAN_API_KEY: "qwen-key" },
          model: { baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1" },
        }),
      ),
    ).toEqual({ accessToken: "qwen-key", raw: { region: "intl" } });
    expect(parseQwenUsageSettings("not json")).toBeUndefined();
  });
});

describe("parseQwenClaudeProfiles", () => {
  it("reuses the secret from an Alibaba-backed Claude profile", () => {
    const settings: SharedSettings = {
      ...defaultSharedSettings,
      agentInstances: {
        qwen: {
          id: "qwen",
          driver: "claude",
          environment: {
            ANTHROPIC_BASE_URL: {
              value: "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic",
            },
            ANTHROPIC_AUTH_TOKEN: { value: "profile-key", sensitive: true },
          },
          config: { configDir: "~/.poracode/claude-profiles/qwen" },
        },
      },
    };
    expect(parseQwenClaudeProfiles(settings)).toEqual({
      accessToken: "profile-key",
      raw: { region: "intl" },
    });
  });

  it("does not reuse secrets from unrelated Claude profiles", () => {
    const settings: SharedSettings = {
      ...defaultSharedSettings,
      agentInstances: {
        other: {
          id: "other",
          driver: "claude",
          environment: {
            ANTHROPIC_BASE_URL: { value: "https://api.example.test/anthropic" },
            ANTHROPIC_AUTH_TOKEN: { value: "other-key", sensitive: true },
          },
          config: { configDir: "~/.poracode/claude-profiles/other" },
        },
      },
    };
    expect(parseQwenClaudeProfiles(settings)).toBeUndefined();
  });
});
