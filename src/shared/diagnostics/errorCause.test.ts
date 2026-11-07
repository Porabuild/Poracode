import { describe, expect, it } from "vitest";
import { buildErrorCauseTags, classifyErrorCause } from "./errorCause";
import { prepareSentryEvent } from "./sentryPrivacy";

describe("safe error causes", () => {
  it("keeps a subprocess exit through wrapping and redaction without its payload", () => {
    const raw = Object.assign(
      new Error("Command failed: gh private-prompt\nprivate-stderr credentials"),
      {
        code: 128,
        cmd: "private-command",
        stdout: "private-stdout",
        stderr: "private-stderr",
        path: "/private/repository",
      },
    );
    const error = new Error(`Git failed: ${raw.message}`, { cause: raw });
    const event = prepareSentryEvent({ message: error.message, tags: buildErrorCauseTags(error) });
    expect(event).toEqual({
      message: "Command failed: [redacted]",
      tags: {
        "poracode.cause_reason": "subprocess-exit",
        "poracode.cause_type": "error",
        "poracode.exit_code": "128",
      },
    });
    expect(classifyErrorCause(error, "test")).toBeUndefined();
  });

  it.each(["ENOENT", "EACCES", "EPERM", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"])(
    "retains %s without suppressing an unknown defect",
    (code) => {
      const error = Object.assign(new Error("private text"), { code });
      expect(buildErrorCauseTags(error)["poracode.cause_code"]).toBe(code);
      expect(classifyErrorCause(error, "test")).toBeUndefined();
    },
  );

  it.each(["ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "ABORT_ERR"])(
    "classifies structural %s through a cause",
    (code) => {
      const error = new Error("private", { cause: Object.assign(new Error("private"), { code }) });
      expect(classifyErrorCause(error, "test")).toMatchObject({
        failureClass: code === "ABORT_ERR" ? "expected-operational" : "transient-service",
      });
    },
  );

  it("preserves built-in defects and does not infer auth or quota from an HTTP refusal", () => {
    const error = Object.assign(new TypeError("private prompt"), { statusCode: 403 });
    expect(buildErrorCauseTags(error)).toEqual({
      "poracode.cause_reason": "http",
      "poracode.cause_type": "type-error",
      "poracode.http_status": "403",
    });
    expect(classifyErrorCause(error, "test")).toBeUndefined();
  });

  it("does not confuse a numeric protocol error code with a child-process exit", () => {
    expect(buildErrorCauseTags(Object.assign(new Error("private"), { code: -32603 }))).toEqual({
      "poracode.cause_type": "error",
      "poracode.cause_reason": "unknown",
    });
  });

  it("rejects arbitrary codes, names, signals, non-integers and out-of-range numbers", () => {
    const error = Object.assign(new Error("private"), {
      name: "private-prompt",
      code: "private-credential",
      statusCode: 1000,
      exitCode: Infinity,
      signal: "private-path",
    });
    expect(buildErrorCauseTags(error)).toEqual({
      "poracode.cause_reason": "unknown",
      "poracode.cause_type": "error",
    });
    expect(
      prepareSentryEvent({
        tags: {
          "poracode.cause_reason": "private-prompt",
          "poracode.cause_code": "secret",
          "poracode.cause_type": "private-type",
          "poracode.signal": "private-signal",
          "poracode.exit_code": "4294967296",
          "poracode.http_status": "600",
        },
      }),
    ).toEqual({});
  });

  it("bounds cyclic causes and preserves only validated synthetic metadata", () => {
    const error = Object.assign(new Error("private"), { cause: {} });
    error.cause = error;
    expect(buildErrorCauseTags(error)["poracode.cause_reason"]).toBe("unknown");
    expect(
      buildErrorCauseTags({
        diagnosticCause: {
          "poracode.cause_reason": "subprocess-exit",
          "poracode.exit_code": "9",
          "poracode.cause_code": "secret",
        },
      }),
    ).toEqual({ "poracode.cause_reason": "subprocess-exit", "poracode.exit_code": "9" });
  });
});
