import { describe, expect, it } from "vitest";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";

// Codex 0.155 reports an expired, exhausted, or revoked refresh token
// (`RefreshTokenFailed`) with this message and `codexErrorInfo: "unauthorized"`.
const EXPIRED_REFRESH_TOKEN_MESSAGE =
  "Your access token could not be refreshed because your refresh token has expired. Please log out and sign in again.";

function failedTurn(error: Record<string, unknown>) {
  const state = createCodexMapperState("t-codex");
  mapCodexNotification("turn/started", { turnId: "t-1", threadId: "x" }, state);
  return mapCodexNotification(
    "turn/completed",
    { threadId: "x", turn: { id: "t-1", status: "failed", error } },
    state,
  );
}

function errorNotification(error: Record<string, unknown>, willRetry = false) {
  return mapCodexNotification(
    "error",
    { threadId: "x", turnId: "t-1", willRetry, error },
    createCodexMapperState("t-codex"),
  );
}

describe("Codex sign-in failures", () => {
  it("marks a failed turn with an expired refresh token as needing sign-in", () => {
    expect(
      failedTurn({ message: EXPIRED_REFRESH_TOKEN_MESSAGE, codexErrorInfo: "unauthorized" }),
    ).toEqual([
      {
        type: "error",
        threadId: "t-codex",
        message: EXPIRED_REFRESH_TOKEN_MESSAGE,
        reason: "auth_required",
      },
      { type: "turn.completed", threadId: "t-codex", turnId: "t-1", state: "failed" },
    ]);
  });

  it("marks a final error notification with an unauthorized code as needing sign-in", () => {
    expect(
      errorNotification({
        message: EXPIRED_REFRESH_TOKEN_MESSAGE,
        codexErrorInfo: "unauthorized",
        additionalDetails: null,
      }),
    ).toEqual([
      {
        type: "error",
        threadId: "t-codex",
        message: EXPIRED_REFRESH_TOKEN_MESSAGE,
        reason: "auth_required",
      },
    ]);
  });

  it.each([
    "httpConnectionFailed",
    "responseStreamConnectionFailed",
    "responseStreamDisconnected",
    "responseTooManyFailedAttempts",
  ])("treats an upstream 401 on %s as needing sign-in", (variant) => {
    expect(
      errorNotification({
        message: "unexpected status 401 Unauthorized",
        codexErrorInfo: { [variant]: { httpStatusCode: 401 } },
      }),
    ).toEqual([
      {
        type: "error",
        threadId: "t-codex",
        message: "unexpected status 401 Unauthorized",
        reason: "auth_required",
      },
    ]);
  });

  it.each<[string, unknown]>([
    ["no error code", undefined],
    ["a null error code", null],
    ["usage limits", "usageLimitExceeded"],
    ["server errors", "internalServerError"],
    ["a non-auth HTTP status", { httpConnectionFailed: { httpStatusCode: 503 } }],
    ["an unknown HTTP status", { httpConnectionFailed: { httpStatusCode: null } }],
  ])("leaves %s as a plain error", (_label, codexErrorInfo) => {
    const error = {
      message: "Turn failed",
      ...(codexErrorInfo !== undefined ? { codexErrorInfo } : {}),
    };
    expect(failedTurn(error)[0]).toEqual({
      type: "error",
      threadId: "t-codex",
      message: "Turn failed",
    });
    expect(errorNotification(error)).toEqual([
      { type: "error", threadId: "t-codex", message: "Turn failed" },
    ]);
  });

  it("does not read the reason from message text", () => {
    expect(errorNotification({ message: EXPIRED_REFRESH_TOKEN_MESSAGE })).toEqual([
      { type: "error", threadId: "t-codex", message: EXPIRED_REFRESH_TOKEN_MESSAGE },
    ]);
  });

  it("keeps a retrying unauthorized error as a hidden warning", () => {
    expect(
      errorNotification({ message: "Reconnecting...", codexErrorInfo: "unauthorized" }, true),
    ).toEqual([{ type: "warning", threadId: "t-codex", message: "Reconnecting..." }]);
  });
});
