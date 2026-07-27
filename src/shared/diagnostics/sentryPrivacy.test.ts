import { describe, expect, it } from "vitest";
import {
  buildRuntimeDiagnosticTags,
  prepareSentryEvent,
  sanitizeSentryEvent,
  type SentryEventLike,
} from "./sentryPrivacy";
import { buildDiagnosticBreadcrumb } from "./sentryPolicy";

describe("sentryPrivacy", () => {
  it("keeps only allowlisted diagnostic tags", () => {
    const event = sanitizeSentryEvent({
      tags: {
        "poracode.error_class": "/Users/alice/private-repo",
        "poracode.failure_domain": "supervisor.ipc",
        "poracode.operational": "true",
        "poracode.provider": "codex",
        "poracode.presentation": "terminal",
        repo: "secret-repo",
        user: "someone@example.com",
      },
    });

    expect(event.tags).toEqual({
      "poracode.failure_domain": "supervisor.ipc",
      "poracode.operational": "true",
      "poracode.provider": "codex",
      "poracode.presentation": "terminal",
    });
  });

  it("drops user, request, extra, modules, and automatic breadcrumbs", () => {
    const event = sanitizeSentryEvent({
      breadcrumbs: [{ message: "terminal output" }],
      extra: { prompt: "write code", token: "secret" },
      modules: { poracode: "0.1.7" },
      request: { url: "file:///Users/alice/work/repo" },
      server_name: "alice-macbook",
      user: { id: "alice" },
    });

    expect(event.breadcrumbs).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.modules).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.user).toBeUndefined();
  });

  it("scrubs messages and exception values while preserving privacy-safe stack shape", () => {
    const event = sanitizeSentryEvent({
      message:
        'Git push failed: Command failed: git push https://github.example/private/repo.git private-branch --force\nfatal: unable to access "https://github.example/private/repo.git": Could not resolve host: github.example',
      exception: {
        values: [
          {
            type: "Error",
            value:
              'Git commit failed: Command failed: git commit -m "private commit message" private-branch\nhusky - pre-commit script failed (code 1)',
            stacktrace: {
              frames: [
                {
                  filename: "/Users/alice/work/private-repo/src/app.ts",
                  abs_path: "file:///Users/alice/work/private-repo/src/app.ts",
                  function: "runThread",
                  vars: { prompt: "private prompt" },
                  context_line: "const token = secret",
                },
              ],
            },
          },
        ],
      },
    } satisfies SentryEventLike);

    expect(event.message).toBe(
      'Git push failed: Command failed: [redacted]\nfatal: unable to access "[url]": Could not resolve host: github.example',
    );
    expect(event.exception?.values?.[0]?.type).toBe("Error");
    expect(event.exception?.values?.[0]?.value).toBe(
      "Git commit failed: Command failed: [redacted]\nhusky - pre-commit script failed (code 1)",
    );
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: "[app-file]/app.ts",
      abs_path: "[app-file]/app.ts",
      function: "runThread",
    });
  });

  it("retains path and credential redaction for ordinary diagnostic reasons", () => {
    const event = sanitizeSentryEvent({
      message: "Failed in /Users/alice/work/private-repo/src/app.ts token=abc123",
      exception: {
        values: [{ value: "Cannot open C:\\Users\\alice\\repo\\secret.ts" }],
      },
    } satisfies SentryEventLike);

    expect(event.message).toBe("Failed in [path] token=[redacted]");
    expect(event.exception?.values?.[0]?.value).toBe("Cannot open [path]");
  });

  it("keeps only curated payload-free diagnostic breadcrumbs", () => {
    const event = sanitizeSentryEvent({
      breadcrumbs: [
        buildDiagnosticBreadcrumb({
          domain: "supervisor.ipc",
          operation: "start-thread",
          state: "running",
          transition: "failed",
        }),
        {
          category: "poracode.diagnostic.transition",
          type: "info",
          message: "private prompt",
          data: {
            domain: "supervisor.ipc",
            operation: "/Users/alice/repo",
            state: "running",
            transition: "failed",
          },
        },
        { category: "console", type: "info", message: "terminal output" },
      ],
    } satisfies SentryEventLike);

    expect(event.breadcrumbs).toEqual([
      {
        category: "poracode.diagnostic.transition",
        type: "info",
        level: "info",
        data: {
          domain: "supervisor.ipc",
          operation: "start-thread",
          state: "running",
          transition: "failed",
        },
      },
    ]);
  });

  it("keeps only stable privacy-safe fingerprints", () => {
    expect(
      sanitizeSentryEvent({
        fingerprint: ["poracode", "supervisor.ipc", "write-terminal", "error"],
      }).fingerprint,
    ).toEqual(["poracode", "supervisor.ipc", "write-terminal", "error"]);
    expect(
      sanitizeSentryEvent({
        fingerprint: ["poracode", "/Users/alice/private-repo"],
      }).fingerprint,
    ).toBeUndefined();
  });

  it.each([
    ["Cannot resize a pty that has already exited", "resizeterminal"],
    ["ioctl(2) failed, ENOTTY", "resizeterminal"],
  ])("drops the audited expected signature as a beforeSend backstop: %s", (value, operation) => {
    expect(
      prepareSentryEvent({
        tags: {
          "poracode.feature_area": "supervisor-ipc",
          "poracode.operation": operation,
        },
        exception: { values: [{ value }] },
      }),
    ).toBeNull();
  });

  it.each(["interruptthread", "sendthreadinput", "writeterminal"])(
    "does not drop a missing-session invariant from %s",
    (operation) => {
      const value = "Unknown thread session: 945a852b-4a68-42c2-ad9d-7671014abc71";
      const event = prepareSentryEvent({
        tags: {
          "poracode.feature_area": "supervisor-ipc",
          "poracode.operation": operation,
        },
        exception: { values: [{ value }] },
      });

      expect(event?.exception?.values?.[0]?.value).toBe(value);
    },
  );

  it("does not drop a resize signature outside resizeTerminal", () => {
    const event = prepareSentryEvent({
      tags: {
        "poracode.feature_area": "supervisor-ipc",
        "poracode.operation": "startthread",
      },
      exception: {
        values: [{ value: "Cannot resize a pty that has already exited" }],
      },
    });

    expect(event?.exception?.values?.[0]?.value).toBe(
      "Cannot resize a pty that has already exited",
    );
  });

  it("does not drop unknown errors at the beforeSend backstop", () => {
    const event = prepareSentryEvent({
      tags: { "poracode.feature_area": "supervisor-ipc" },
      exception: {
        values: [
          {
            value: "ENOENT: /Users/alice/private-repo",
            stacktrace: { frames: [{ function: "readProjectFile" }] },
          },
        ],
      },
    });

    expect(event).not.toBeNull();
    expect(event?.exception?.values?.[0]?.value).toBe("ENOENT: [path]");
    expect(event?.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      { function: "readProjectFile" },
    ]);
  });

  it("preserves the poracode context (channel, appVersion, packaged) while still dropping disallowed contexts", () => {
    const event = sanitizeSentryEvent({
      contexts: {
        poracode: {
          appVersion: "0.9.5",
          channel: "nightly",
          packaged: true,
          process: "main",
        },
        runtime: { name: "node", version: "24.10.0" },
        session: { id: "should-be-dropped" },
      },
    } satisfies SentryEventLike);

    expect(event.contexts?.poracode).toEqual({
      appVersion: "0.9.5",
      channel: "nightly",
      packaged: true,
      process: "main",
    });
    expect(event.contexts?.runtime).toEqual({ name: "node", version: "24.10.0" });
    expect(event.contexts?.session).toBeUndefined();
  });

  it("builds coarse runtime tags without thread or project identifiers", () => {
    expect(
      buildRuntimeDiagnosticTags({
        provider: "codex",
        presentation: "gui",
        runtimeKind: "structured",
        featureArea: "thread",
      }),
    ).toEqual({
      "poracode.feature_area": "thread",
      "poracode.presentation": "gui",
      "poracode.provider": "codex",
      "poracode.runtime_kind": "structured",
    });
  });
});
