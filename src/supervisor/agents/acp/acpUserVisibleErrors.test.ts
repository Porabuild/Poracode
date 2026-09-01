import { describe, expect, it } from "vitest";
import { isFatalAcpQuotaError, parseAcpAgentMessageApiError } from "./acpUserVisibleErrors";

describe("parseAcpAgentMessageApiError", () => {
  it("extracts detail from Factory Droid usage-limit payloads", () => {
    const text =
      'Error: 402 {"detail":"You\'ve reached your 5-hour Droid Core usage limit (resets in 0h 3min).\\nReload Extra Usage credits or wait for your limits to reset.","status":402,"title":"Payment Required","displayToUser":true}';
    expect(parseAcpAgentMessageApiError(text)).toBe(
      "You've reached your 5-hour Droid Core usage limit (resets in 0h 3min).\nReload Extra Usage credits or wait for your limits to reset.",
    );
  });

  it("maps plain HTTP no-body errors to actionable messages", () => {
    expect(parseAcpAgentMessageApiError("Error: 403 status code (no body)")).toBe(
      "Access denied (HTTP 403). Your Factory account may lack permission for this model or workspace.",
    );
  });

  it("returns undefined for normal assistant text", () => {
    expect(parseAcpAgentMessageApiError("Here is the fix for your bug.")).toBeUndefined();
    expect(parseAcpAgentMessageApiError("Error: something went wrong")).toBeUndefined();
  });

  it("extracts Antigravity quota failures from tool-result blobs", () => {
    const text =
      'Encountered retryable error from model provider: Agent execution terminated due to error. ("request failed (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 1h33m48s.")';
    const message = parseAcpAgentMessageApiError(text);
    expect(message).toContain("Individual quota reached");
    expect(isFatalAcpQuotaError(message ?? "")).toBe(true);
  });
});
