import { describe, expect, it } from "vitest";
import {
  parseQoderUsageEnv,
  QODER_API_KEY_ENV,
  QODER_BASE_URL_ENV,
  QODER_ENDPOINT_ENV,
  QODER_PERSONAL_ACCESS_TOKEN_ENV,
} from "./qoderCredentials";

describe("parseQoderUsageEnv", () => {
  it("returns undefined when no Qoder env vars are set", () => {
    expect(parseQoderUsageEnv({})).toBeUndefined();
    expect(parseQoderUsageEnv({ [QODER_PERSONAL_ACCESS_TOKEN_ENV]: "" })).toBeUndefined();
    expect(parseQoderUsageEnv({ [QODER_PERSONAL_ACCESS_TOKEN_ENV]: "   " })).toBeUndefined();
  });

  it("reads QODER_PERSONAL_ACCESS_TOKEN and cleans quotes", () => {
    const token = parseQoderUsageEnv({
      [QODER_PERSONAL_ACCESS_TOKEN_ENV]: '"  qoder-pat-value  "',
    });
    expect(token).toEqual({ accessToken: "qoder-pat-value" });
  });

  it("falls back to QODER_API_KEY", () => {
    const token = parseQoderUsageEnv({
      [QODER_API_KEY_ENV]: "'qoder-api-key'",
    });
    expect(token).toEqual({ accessToken: "qoder-api-key" });
  });

  it("attaches QODER_BASE_URL and QODER_ENDPOINT to raw bag", () => {
    const token = parseQoderUsageEnv({
      [QODER_PERSONAL_ACCESS_TOKEN_ENV]: "pat-123",
      [QODER_BASE_URL_ENV]: "https://qoder.com.cn",
      [QODER_ENDPOINT_ENV]: "https://qoder.com.cn/api/v2/me/usages/big_model_credits",
    });
    expect(token).toEqual({
      accessToken: "pat-123",
      raw: {
        baseUrl: "https://qoder.com.cn",
        endpoint: "https://qoder.com.cn/api/v2/me/usages/big_model_credits",
      },
    });
  });
});
