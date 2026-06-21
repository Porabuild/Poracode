import { describe, expect, it } from "vitest";
import { parseZaiEnv } from "./zaiCredentials";

describe("parseZaiEnv", () => {
  it("returns undefined when no API key is set", () => {
    expect(parseZaiEnv({})).toBeUndefined();
    expect(parseZaiEnv({ Z_AI_API_HOST: "open.bigmodel.cn" })).toBeUndefined();
  });

  it("reads the API key and strips wrapping quotes/whitespace", () => {
    expect(parseZaiEnv({ Z_AI_API_KEY: '  "zai-key"  ' })).toEqual({ accessToken: "zai-key" });
  });

  it("carries host overrides on raw without polluting it when absent", () => {
    expect(parseZaiEnv({ Z_AI_API_KEY: "k" })).toEqual({ accessToken: "k" });
    expect(parseZaiEnv({ Z_AI_API_KEY: "k", Z_AI_API_HOST: "open.bigmodel.cn" })).toEqual({
      accessToken: "k",
      raw: { apiHost: "open.bigmodel.cn" },
    });
    expect(parseZaiEnv({ Z_AI_API_KEY: "k", Z_AI_QUOTA_URL: "https://example.com/q" })).toEqual({
      accessToken: "k",
      raw: { quotaUrl: "https://example.com/q" },
    });
  });
});
