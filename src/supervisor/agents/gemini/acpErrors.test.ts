import { describe, expect, it } from "vitest";
import { resolveGeminiEmptyResponseError, resolveGeminiPromptErrorReason } from "./acpErrors";
import { msg } from "@/shared/messages";

describe("resolveGeminiEmptyResponseError", () => {
  it("classifies authentication failures from stderr", () => {
    const error = resolveGeminiEmptyResponseError({
      stopReason: "end_turn",
      stderr: ["Error: API_KEY_INVALID: API key not valid. Please pass a valid API key."],
    });
    expect(error.message).toBe(msg("gemini.authFailed"));
  });

  it("classifies quota and rate-limit failures from stderr", () => {
    const error = resolveGeminiEmptyResponseError({
      stopReason: "end_turn",
      stderr: ["RESOURCE_EXHAUSTED (429): Quota exceeded for model"],
    });
    expect(error.message).toBe(msg("gemini.quotaExceeded"));
  });

  it("classifies safety/policy blocked turns from stderr", () => {
    const error = resolveGeminiEmptyResponseError({
      stopReason: "end_turn",
      stderr: ["Response candidate finishReason: SAFETY"],
    });
    expect(error.message).toBe(msg("gemini.responseBlocked"));
  });

  it("never returns an empty error when stderr has no specific hint", () => {
    const error = resolveGeminiEmptyResponseError({
      stopReason: "end_turn",
      stderr: [],
    });
    expect(error.message).toBe(msg("gemini.emptyResponse"));
  });
});

describe("resolveGeminiPromptErrorReason", () => {
  it("maps HTTP 401 and 403 status fields to auth_required", () => {
    expect(
      resolveGeminiPromptErrorReason({
        code: -32603,
        message: "Internal error",
        data: { status: 401 },
      }),
    ).toBe("auth_required");
    expect(
      resolveGeminiPromptErrorReason({
        code: -32603,
        message: "Request failed",
        data: { code: "403" },
      }),
    ).toBe("auth_required");
  });

  it("maps Gemini auth error messages in string and nested data fields to auth_required", () => {
    expect(resolveGeminiPromptErrorReason("API_KEY_INVALID")).toBe("auth_required");
    expect(
      resolveGeminiPromptErrorReason({
        message: "Turn failed",
        data: { details: "OAuth token expired — login required" },
      }),
    ).toBe("auth_required");
  });

  it("returns undefined for unrelated errors", () => {
    expect(
      resolveGeminiPromptErrorReason({
        code: -32603,
        message: "Network timeout",
        data: { status: 504 },
      }),
    ).toBeUndefined();
    expect(resolveGeminiPromptErrorReason(null)).toBeUndefined();
  });
});
