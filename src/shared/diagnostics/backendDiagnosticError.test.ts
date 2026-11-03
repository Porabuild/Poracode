import { describe, expect, it } from "vitest";
import {
  isBackendHostOutboundMessage,
  BACKEND_HOST_PROTOCOL_VERSION,
} from "../backendHostProtocol";
import { buildErrorCauseTags } from "./errorCause";
import { prepareMainSentryEvent } from "../../main/diagnostics/mainEvent";
import {
  serializeBackendDiagnosticError,
  restoreBackendDiagnosticError,
} from "./backendDiagnosticError";

describe("backend diagnostic propagation", () => {
  it.each([
    "Supervisor exited with code 3221226091",
    "Supervisor exited with code 1073807364",
    "net::ERR_NETWORK_CHANGED",
  ])("preserves existing exact operational filtering: %s", (message) => {
    const restored = restoreBackendDiagnosticError(
      "Backend operation failed.",
      serializeBackendDiagnosticError(new Error(message)),
    );
    const event = {
      exception: { values: [{ type: "Error", value: restored.message }] },
      tags: { "poracode.process": "main" },
    };
    expect(prepareMainSentryEvent(event, "win32")).toBeNull();
    expect(prepareMainSentryEvent(event, "linux") === null).toBe(
      message === "net::ERR_NETWORK_CHANGED",
    );
  });

  it.each([
    "Supervisor exited with code 1",
    "Unexpected: Supervisor exited with code 3221226091",
    "net::ERR_NETWORK_CHANGED private",
  ])("does not forward nearby arbitrary messages: %s", (message) => {
    const diagnostic = serializeBackendDiagnosticError(new Error(message));
    expect(diagnostic).not.toHaveProperty("message");
    expect(restoreBackendDiagnosticError("safe", diagnostic).message).toBe(
      "Backend operation failed.",
    );
  });

  it("retains source bundle coordinates and safe causes without raw error or stack data", () => {
    const error = Object.assign(new TypeError("private-prompt private-credential"), {
      code: "ENOSPC",
    });
    error.stack =
      "TypeError: private-prompt\n    at privateFunction (C:\\Users\\private-user\\app\\backendHost.cjs:123:45)\n    at /home/private/path.js:12:3";
    const diagnostic = serializeBackendDiagnosticError(error);
    const message = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "error",
      message: "Backend operation failed.",
      diagnostic,
    };
    expect(isBackendHostOutboundMessage(message)).toBe(true);
    expect(diagnostic.frames).toEqual([{ bundle: "backendHost.cjs", line: 123, column: 45 }]);
    expect(JSON.stringify(message)).not.toContain("private");
    const restored = restoreBackendDiagnosticError(message.message, diagnostic);
    expect(restored.stack).toBe("Error: Backend operation failed.\n    at backendHost.cjs:123:45");
    expect(buildErrorCauseTags(restored)).toEqual(buildErrorCauseTags(error));
  });

  it("accepts the previous message-only shape", () => {
    expect(
      isBackendHostOutboundMessage({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "error",
        message: "legacy",
      }),
    ).toBe(true);
    expect(restoreBackendDiagnosticError("legacy").message).toBe("legacy");
  });

  it.each([
    {
      formatVersion: 1,
      cause: { "poracode.cause_reason": "unknown" },
      frames: [],
      message: "private message",
    },
    { formatVersion: 2, cause: {}, frames: [] },
    { formatVersion: 1, cause: { "poracode.cause_reason": "secret" }, frames: [] },
    {
      formatVersion: 1,
      cause: { "poracode.cause_reason": "unknown", stderr: "secret" },
      frames: [],
    },
    {
      formatVersion: 1,
      cause: { "poracode.cause_reason": "unknown" },
      frames: [{ bundle: "/private/path", line: 1, column: 1 }],
    },
    {
      formatVersion: 1,
      cause: { "poracode.cause_reason": "unknown" },
      frames: [{ bundle: "backendHost.cjs", line: Infinity, column: 1 }],
    },
  ])("rejects future or unsafe details", (diagnostic) => {
    expect(
      isBackendHostOutboundMessage({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "error",
        message: "safe",
        diagnostic,
      }),
    ).toBe(false);
  });

  it("bounds frames and does not invent a receiver stack when no source is available", () => {
    const error = new Error("private");
    error.stack = "Error: private" + "\n    at /private/backendHost.cjs:1:2".repeat(100);
    expect(serializeBackendDiagnosticError(error).frames).toHaveLength(20);
    expect(
      restoreBackendDiagnosticError("safe", serializeBackendDiagnosticError("private")).stack,
    ).toBe("Error: Backend operation failed.");
  });
});
