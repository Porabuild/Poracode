import { describe, expect, it } from "vitest";
import {
  buildDiagnosticBreadcrumb,
  classifyDiagnosticFailure,
  DiagnosticError,
} from "./sentryPolicy";

describe("sentryPolicy", () => {
  it.each([
    ["expected-operational", "drop", null, true],
    ["transient-service", "metric", "warning", true],
    ["product-defect", "capture", "error", false],
  ] as const)(
    "maps %s failures to their enforced treatment",
    (failureClass, treatment, level, operational) => {
      const error = new DiagnosticError("caller-visible detail", {
        failureClass,
        domain: "provider.service",
        errorClass: "service-unavailable",
      });

      expect(
        classifyDiagnosticFailure(error, {
          domain: "fallback",
          operation: "refresh-usage",
        }),
      ).toMatchObject({
        failureClass,
        treatment,
        level,
        operational,
        domain: "provider.service",
        operation: "refresh-usage",
        errorClass: "service-unavailable",
      });
    },
  );

  it("preserves unknown failures as captured errors", () => {
    const error = new TypeError("private prompt and /private/path");

    expect(
      classifyDiagnosticFailure(error, {
        domain: "supervisor.ipc",
        operation: "start-thread",
      }),
    ).toEqual({
      failureClass: "unknown",
      treatment: "capture",
      level: "error",
      operational: false,
      domain: "supervisor.ipc",
      operation: "start-thread",
      errorClass: "type-error",
      fingerprint: null,
    });
  });

  it("builds typed fingerprints independently of raw messages and paths", () => {
    const metadata = {
      failureClass: "product-defect",
      domain: "supervisor.ipc",
      errorClass: "invalid-state",
    } as const;
    const first = classifyDiagnosticFailure(
      new DiagnosticError("failed in /Users/alice/repo", metadata),
      {
        domain: "fallback",
        operation: "start-thread",
      },
    );
    const second = classifyDiagnosticFailure(
      new DiagnosticError("different command and prompt", metadata),
      {
        domain: "fallback",
        operation: "start-thread",
      },
    );

    expect(first.fingerprint).toEqual(second.fingerprint);
    expect(first.fingerprint?.join(":")).not.toContain("alice");
    expect(first.fingerprint?.join(":")).not.toContain("command");
  });

  it("leaves unknown failures at different stack sites to Sentry default grouping", () => {
    function firstSite(): Error {
      return new Error("same message");
    }
    function secondSite(): Error {
      return new Error("same message");
    }

    const first = firstSite();
    const second = secondSite();
    const context = { domain: "supervisor.ipc", operation: "start-thread" };

    expect(first.stack).not.toEqual(second.stack);
    expect(classifyDiagnosticFailure(first, context).fingerprint).toBeNull();
    expect(classifyDiagnosticFailure(second, context).fingerprint).toBeNull();
  });

  it("rejects unsafe metadata tokens instead of normalizing private values", () => {
    const error = new DiagnosticError("caller-visible detail", {
      failureClass: "product-defect",
      domain: "/Users/alice/private-repo",
      errorClass: "prompt text with spaces",
    });

    expect(
      classifyDiagnosticFailure(error, {
        domain: "fallback",
        operation: "run-command",
      }),
    ).toMatchObject({
      domain: "unknown",
      errorClass: "unknown-error",
      fingerprint: ["poracode", "unknown", "run-command", "unknown-error"],
    });
  });

  it("creates a payload-free diagnostic transition breadcrumb", () => {
    expect(
      buildDiagnosticBreadcrumb({
        domain: "supervisor.ipc",
        operation: "write-terminal",
        state: "failed",
        transition: "expected-operational",
        level: "warning",
      }),
    ).toEqual({
      category: "poracode.diagnostic.transition",
      type: "info",
      level: "warning",
      data: {
        domain: "supervisor.ipc",
        operation: "write-terminal",
        state: "failed",
        transition: "expected-operational",
      },
    });
  });
});
