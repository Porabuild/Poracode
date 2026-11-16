import Module from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SentryEventLike } from "@/shared/diagnostics/sentryPrivacy";
import { DiagnosticError } from "@/shared/diagnostics/sentryPolicy";
import { buildErrorCauseTags } from "@/shared/diagnostics/errorCause";
import { StructuredRuntimeDiagnosticError } from "../runtime/threadSession/structuredRuntimeDiagnosticError";
import {
  HostResourceBusyError,
  HostResourcePolicyUnavailableError,
} from "../runtime/hostResourceAdmission";
import {
  classifySupervisorFailure,
  classifySupervisorIpcFailure,
  initializeSupervisorSentry,
} from "./sentry";
import {
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GitProcessAdmissionError,
} from "../git/gitProcessAdmission";

const sentryMock = vi.hoisted(() => ({
  init: vi.fn<(options: { beforeSend: (event: never) => unknown }) => void>(),
  setContext: vi.fn<(name: string, value: Record<string, unknown>) => void>(),
}));

type ClassificationCase = {
  operation: string;
  message: string;
  errorClass: string;
  operationScoped?: boolean;
};

const EXPECTED_OPERATIONAL_CASES: ClassificationCase[] = [
  {
    operation: "resizeTerminal",
    message: "Cannot resize a pty that has already exited",
    errorClass: "terminal-already-exited",
  },
  {
    operation: "resizeTerminal",
    message: "ioctl(2) failed, ENOTTY",
    errorClass: "terminal-not-attached",
  },
  {
    operation: "ghListPrs",
    message: 'GitHub CLI is not authenticated. Run "gh auth login" in the terminal.',
    errorClass: "github-cli-unauthenticated",
  },
  {
    operation: "ghGetPrForBranch",
    message: 'GitHub CLI is not authenticated. Run "gh auth login" in the terminal.',
    errorClass: "github-cli-unauthenticated",
  },
  {
    operation: "ghGetPrForBranch",
    message: "Configure credentials scoped to this exact source host in the project's runtime.",
    errorClass: "source-host-credentials-unconfigured",
  },
  {
    operation: "ghListPrs",
    message: "Configure credentials scoped to this exact source host in the project's runtime.",
    errorClass: "source-host-credentials-unconfigured",
  },
  {
    operation: "readProjectFile",
    message: "Only files can be opened in the editor.",
    errorClass: "editor-target-not-file",
  },
  {
    operation: "readProjectFile",
    message: "Path traversal is not allowed.",
    errorClass: "project-path-traversal-rejected",
  },
  {
    operation: "interruptThread",
    message: "NO ACTIVE TURN TO INTERRUPT",
    errorClass: "no-active-turn",
  },
  {
    operation: "rollbackThreadConversation",
    message: "pi ACP does not support checkpoint rollback.",
    errorClass: "checkpoint-rollback-unsupported",
  },
  {
    operation: "extractContext",
    message: "Cannot extract context from OpenCode: no session resume or scrollback available",
    errorClass: "context-extraction-unavailable",
  },
  {
    operation: "generateTitle",
    message: "No default one-shot model configured for GitHub Copilot",
    errorClass: "one-shot-model-unconfigured",
  },
  {
    operation: "generatePrSummary",
    message: "No commits found between branches",
    errorClass: "no-commits-between-branches",
  },
  {
    operation: "ghCreatePr",
    message:
      'gh pr create failed\na pull request for branch "feature" into branch "master" already exists:\nhttps://github.example/pull/1\n',
    errorClass: "github-pull-request-exists",
  },
  {
    operation: "startThread",
    message:
      "error: failed to run prompt: provider.api_error: 403 You've reached your usage limit for this billing cycle. Your quota will be refreshed in the next cycle.\nSee log: /private/path",
    errorClass: "provider-quota-exhausted",
  },
  {
    operation: "sendThreadInput",
    message:
      "Payment or usage limit reached (HTTP 402). Check your Factory account billing or usage.",
    errorClass: "provider-quota-exhausted",
  },
  {
    operation: "startThread",
    message: "Internal error: Device authentication failed",
    errorClass: "provider-authentication-required",
  },
  {
    operation: "authenticateAcpAgent",
    message: "User authentication required",
    errorClass: "provider-authentication-required",
  },
  {
    operation: "createFileCheckpoint",
    message:
      "Git rev-parse failed: Command failed: git rev-parse --is-inside-work-tree\nfatal: not a git repository (or any of the parent directories): .git\n",
    errorClass: "git-not-a-repository",
    operationScoped: false,
  },
  {
    operation: "gitCommit",
    message:
      "Git commit failed: Command failed: git commit\nhusky - pre-commit hook exited with code 127 (error)\n",
    errorClass: "git-commit-hook-rejected",
  },
  {
    operation: "gitPush",
    message:
      "Git push failed\n ! [rejected] main -> main (non-fast-forward)\nhint: Updates were rejected because the tip of your current branch is behind\n",
    errorClass: "git-non-fast-forward",
  },
  {
    operation: "gitPush",
    message:
      "Git push failed\nhint: Updates were rejected because the tip of your current branch is behind its remote counterpart\n",
    errorClass: "git-non-fast-forward",
  },
  {
    operation: "gitCommit",
    message:
      "Git commit failed: Command failed: git commit\nhusky - pre-commit script failed (code 1)\n",
    errorClass: "git-commit-hook-rejected",
  },
];

const NEAR_MISS_CASES: ClassificationCase[] = [
  {
    operation: "ghGetPrForBranch",
    message: "Configure credentials scoped to this source host in the project's runtime.",
    errorClass: "source-host-credentials-unconfigured",
  },
  {
    operation: "readProjectFile",
    message: "Only files can be opened in the editor",
    errorClass: "editor-target-not-file",
  },
  {
    operation: "readProjectFile",
    message: "Path traversal is not allowed",
    errorClass: "project-path-traversal-rejected",
  },
  {
    operation: "ghListPrs",
    message: 'GitHub CLI is not authenticated. Run "gh auth login" in the terminal!',
    errorClass: "github-cli-unauthenticated",
  },
  {
    operation: "interruptThread",
    message: "no active turns to interrupt",
    errorClass: "no-active-turn",
  },
  {
    operation: "rollbackThreadConversation",
    message: "pi ACP does not support checkpoint rollback",
    errorClass: "checkpoint-rollback-unsupported",
  },
  {
    operation: "extractContext",
    message: "Cannot extract context from OpenCode: scrollback read failed",
    errorClass: "context-extraction-unavailable",
  },
  {
    operation: "generateTitle",
    message: "No default model configured for GitHub Copilot",
    errorClass: "one-shot-model-unconfigured",
  },
  {
    operation: "generatePrSummary",
    message: "No commits found between branches.",
    errorClass: "no-commits-between-branches",
  },
  {
    operation: "ghCreatePr",
    message: 'GraphQL: Field "mergeStateStatus" doesn\'t exist on type "PullRequest"',
    errorClass: "github-pull-request-exists",
  },
  {
    operation: "ghCreatePr",
    message:
      'a pull request for branch "feature" into branch "master" already exists\nhttps://github.example/pull/1',
    errorClass: "github-pull-request-exists",
  },
  {
    operation: "generateTitle",
    message: "error: failed to run prompt: provider.api_error: 403 Forbidden",
    errorClass: "provider-quota-exhausted",
  },
  {
    operation: "startThread",
    message: "Internal error: Authentication failed",
    errorClass: "provider-authentication-required",
  },
  {
    operation: "createFileCheckpoint",
    message: "fatal: this operation must be run in a work tree",
    errorClass: "git-not-a-repository",
  },
  {
    operation: "gitCommit",
    message: "Git commit failed: Command failed: git commit",
    errorClass: "git-commit-hook-rejected",
  },
  {
    operation: "gitCommit",
    message:
      "Git commit failed: Command failed: git commit\nhusky - pre-commit script failed unexpectedly (code 1)\n",
    errorClass: "git-commit-hook-rejected",
  },
  {
    operation: "gitPush",
    message: "Git push failed: Updates were rejected by the remote.",
    errorClass: "git-non-fast-forward",
  },
];

function expectUnknown(operation: string, message: string): void {
  expect(classifySupervisorIpcFailure(new Error(message), operation)).toMatchObject({
    failureClass: "unknown",
    treatment: "capture",
    level: "error",
    operational: false,
    errorClass: "error",
    fingerprint: null,
  });
}

function expectTransient(operation: string, error: Error, errorClass: string): void {
  expect(classifySupervisorIpcFailure(error, operation)).toEqual({
    failureClass: "transient-service",
    treatment: "metric",
    level: "warning",
    operational: true,
    domain: "supervisor.ipc",
    operation: operation.toLowerCase(),
    errorClass,
    fingerprint: ["poracode", "supervisor.ipc", operation.toLowerCase(), errorClass],
  });
}

describe("supervisor Sentry policy", () => {
  it("sends safe reasons through the actual capture and beforeSend path", async () => {
    vi.resetModules();
    let beforeSend: (event: SentryEventLike) => SentryEventLike | null = () => null;
    let tags: Record<string, unknown> = {};
    const events: Array<SentryEventLike | null> = [];
    const metrics = vi.fn<(name: string, count: number, options: unknown) => void>();
    const sdk = {
      init: (options: { beforeSend: typeof beforeSend }) => {
        beforeSend = options.beforeSend;
      },
      setContext: () => {},
      isEnabled: () => true,
      metrics: { count: metrics },
      withScope: (callback: (scope: unknown) => void) =>
        callback({
          setTags: (value: Record<string, unknown>) => {
            tags = value;
          },
          setFingerprint: () => {},
          setLevel: () => {},
          addBreadcrumb: () => {},
        }),
      captureException: (error: Error) => {
        events.push(beforeSend({ message: error.message, tags }));
      },
    };
    const loader = Module as unknown as { _load(request: string, ...args: unknown[]): unknown };
    const originalLoad = loader._load;
    const spy = vi
      .spyOn(loader, "_load")
      .mockImplementation((request, ...args) =>
        request === "@sentry/node" ? sdk : originalLoad(request, ...args),
      );
    const previousDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = "https://public@example.test/1";
    try {
      const reporter = await import("./sentry");
      expect(reporter.initializeSupervisorSentry({ appVersion: "test", isDev: false })).toBe(true);
      reporter.captureSupervisorIpcFailure(
        Object.assign(new Error("Command failed: private-command\nprivate-stderr"), {
          cmd: "private-command",
          code: 128,
        }),
        "gitFetch",
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        message: "Command failed: [redacted]",
        tags: { "poracode.cause_reason": "subprocess-exit", "poracode.exit_code": "128" },
      });
      expect(JSON.stringify(events)).not.toContain("private");
      reporter.captureSupervisorIpcFailure(
        Object.assign(new Error("private"), { code: "ABORT_ERR" }),
        "gitFetch",
      );
      reporter.captureSupervisorIpcFailure(
        Object.assign(new Error("private"), { code: "ECONNRESET" }),
        "gitFetch",
      );
      expect(events).toHaveLength(1);
      expect(metrics).toHaveBeenCalledOnce();
      reporter.captureSupervisorIpcFailure(new TypeError("Parser invariant failed."), "gitFetch");
      expect(events).toHaveLength(2);
      expect(events[1]?.tags).toMatchObject({ "poracode.cause_type": "type-error" });
    } finally {
      spy.mockRestore();
      if (previousDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = previousDsn;
    }
  });
  it.each(["ABORT_ERR", "ECONNRESET", "ETIMEDOUT"])(
    "routes structural %s away from bug events",
    (code) => {
      const error = Object.assign(new Error("private"), { code });
      expect(classifySupervisorIpcFailure(error, "gitFetch").treatment).toBe(
        code === "ABORT_ERR" ? "drop" : "metric",
      );
      expect(
        classifySupervisorFailure(
          new StructuredRuntimeDiagnosticError("turn", "codex", error),
          "structured-runtime-turn",
        ).treatment,
      ).toBe(code === "ABORT_ERR" ? "drop" : "metric");
    },
  );

  it.each(["ABORT_ERR", "ECONNRESET"])(
    "keeps explicit product defects reportable despite a %s cause",
    (code) => {
      const source = new DiagnosticError(
        "private payload",
        { failureClass: "product-defect", domain: "provider.session", errorClass: "parser-failed" },
        { cause: Object.assign(new Error("private cause"), { code }) },
      );
      const wrapped = new Error("private wrapper", { cause: source });
      for (const error of [
        source,
        wrapped,
        new StructuredRuntimeDiagnosticError("turn", "codex", wrapped),
      ]) {
        expect(classifySupervisorIpcFailure(error, "sendThreadInput")).toMatchObject({
          treatment: "capture",
          errorClass: "parser-failed",
          domain: "provider.session",
        });
        expect(classifySupervisorFailure(error, "structured-runtime-turn").treatment).toBe(
          "capture",
        );
        expect(buildErrorCauseTags(error)["poracode.cause_code"]).toBe(code);
      }
      expect(
        JSON.stringify(new StructuredRuntimeDiagnosticError("turn", "codex", wrapped)),
      ).not.toContain("private");
    },
  );

  it.each([128, 9, "ENOENT", "EPERM"])("keeps unknown subprocess %s observable", (code) => {
    expect(
      classifySupervisorIpcFailure(
        Object.assign(new Error("Command failed: private"), { code }),
        "gitFetch",
      ).treatment,
    ).toBe("capture");
  });
  it("does not initialize reporting in local development", () => {
    const originalDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = "https://public@example.test/1";
    try {
      expect(initializeSupervisorSentry({ appVersion: "test", isDev: true })).toBe(false);
    } finally {
      if (originalDsn === undefined) {
        delete process.env.SENTRY_DSN;
      } else {
        process.env.SENTRY_DSN = originalDsn;
      }
    }
  });

  it.each([
    ["Structured runtime session creation failed.", "session-creation-failed"],
    ["Structured runtime transport failed.", "transport-failed"],
    ["Structured runtime turn failed.", "turn-failed"],
  ])("classifies the stable structured-runtime identity: %s", (message, errorClass) => {
    const error = new Error(message) as Error & { diagnosticProvider?: string };
    error.name = "StructuredRuntimeDiagnosticError";
    error.diagnosticProvider = "codex";

    expect(classifySupervisorIpcFailure(error, "startThread")).toEqual({
      failureClass: "product-defect",
      treatment: "capture",
      level: "error",
      operational: false,
      domain: "structured-runtime",
      operation: "startthread",
      errorClass,
      fingerprint: ["poracode", "structured-runtime", "startthread", errorClass],
    });
    expect(classifySupervisorFailure(error, "structured-runtime-turn")).toEqual({
      failureClass: "product-defect",
      treatment: "capture",
      level: "error",
      operational: false,
      domain: "structured-runtime",
      operation: "structured-runtime-turn",
      errorClass,
      fingerprint: ["poracode", "structured-runtime", "structured-runtime-turn", errorClass],
    });
  });

  it("keeps a structured-runtime name/message near miss unknown", () => {
    const error = new Error("Structured runtime provider output failed.");
    error.name = "StructuredRuntimeDiagnosticError";

    expect(classifySupervisorIpcFailure(error, "startThread")).toMatchObject({
      failureClass: "unknown",
      treatment: "capture",
      domain: "supervisor.ipc",
      fingerprint: null,
    });
  });

  it.each([
    [
      "host-resource-busy",
      new HostResourceBusyError({
        resourceClass: "agent-session",
        limit: 1,
        active: 1,
        pending: 0,
        retiring: 0,
        retryAfterMs: 1_000,
      }),
    ],
    [
      "host-resource-policy-unavailable",
      new HostResourcePolicyUnavailableError("host-resource-admission-invalid"),
    ],
    [
      "git-admission-refusal",
      new GitProcessAdmissionError(
        GIT_ADMISSION_QUEUE_FULL_CODE,
        {
          gitClass: "short",
          units: 1,
          limit: 8,
          active: 8,
          queued: 64,
          retryAfterMs: 1_000,
        },
        "Git short admission queue is full.",
      ),
    ],
  ])("treats a typed admission refusal as expected operational: %s", (errorClass, error) => {
    expect(classifySupervisorIpcFailure(error, "startThread")).toEqual({
      failureClass: "expected-operational",
      treatment: "drop",
      level: null,
      operational: true,
      domain: "supervisor.ipc",
      operation: "startthread",
      errorClass,
      fingerprint: ["poracode", "supervisor.ipc", "startthread", errorClass],
    });
  });

  it.each(EXPECTED_OPERATIONAL_CASES)(
    "drops $errorClass only for $operation",
    ({ operation, message, errorClass }) => {
      expect(classifySupervisorIpcFailure(new Error(message), operation)).toEqual({
        failureClass: "expected-operational",
        treatment: "drop",
        level: null,
        operational: true,
        domain: "supervisor.ipc",
        operation: operation.toLowerCase(),
        errorClass,
        fingerprint: ["poracode", "supervisor.ipc", operation.toLowerCase(), errorClass],
      });
    },
  );

  it("routes the exact generateTitle server failure to a warning metric", () => {
    expect.hasAssertions();
    expectTransient(
      "generateTitle",
      new Error("session.prompt: Unexpected server error. Check server logs for details."),
      "provider-service-unavailable",
    );
  });

  it.each(["gitFetch", "gitPull", "gitPullRebase", "gitPush", "gitSync", "gitSyncRebase"])(
    "routes an audited network failure from %s to a warning metric",
    (operation) => {
      expect.hasAssertions();
      expectTransient(
        operation,
        new Error(
          "Git remote operation failed: Command failed: git remote-operation\nfatal: Failed to connect to proxy: Could not connect to server",
        ),
        "git-network-unavailable",
      );
    },
  );

  it("routes only an exact fetch TypeError to a warning metric", () => {
    expectTransient("getProviderUsage", new TypeError("fetch failed"), "fetch-failed");
    expectUnknown("getProviderUsage", "fetch failed");
    expect(
      classifySupervisorIpcFailure(
        new TypeError("fetch failed with status 500"),
        "getProviderUsage",
      ),
    ).toMatchObject({
      failureClass: "unknown",
      treatment: "capture",
      errorClass: "type-error",
      fingerprint: null,
    });
  });

  it.each(NEAR_MISS_CASES)(
    "keeps the $errorClass near miss as an unknown error",
    ({ operation, message }) => {
      expect.hasAssertions();
      expectUnknown(operation, message);
    },
  );

  it.each(EXPECTED_OPERATIONAL_CASES.filter((testCase) => testCase.operationScoped !== false))(
    "keeps $errorClass unknown outside its scoped operation",
    ({ operation, message }) => {
      expect.hasAssertions();
      expectUnknown(
        operation === "readProjectFile" ? "writeProjectFile" : "readProjectFile",
        message,
      );
    },
  );

  it("keeps the transient signature unknown outside generateTitle", () => {
    expect.hasAssertions();
    expectUnknown(
      "generatePrSummary",
      "session.prompt: Unexpected server error. Check server logs for details.",
    );
  });

  it("keeps ambiguous Git transport and push failures captured", () => {
    expect.hasAssertions();
    expectUnknown("gitPull", "Git pull failed: Command failed: git pull origin");
    expectUnknown(
      "gitPush",
      "Git push failed\n ! [rejected] main -> main (fetch first)\nerror: failed to push some refs",
    );
    expectUnknown(
      "gitCommit",
      "Git commit failed: Command failed: git commit\nlint failed with code 1",
    );
  });

  it.each(["interruptThread", "sendThreadInput", "writeTerminal"])(
    "preserves a never-known thread invariant failure from %s",
    (operation) => {
      expect.hasAssertions();
      expectUnknown(operation, "Unknown thread session: 945a852b-4a68-42c2-ad9d-7671014abc71");
    },
  );

  it("preserves generic filesystem failures as unknown errors", () => {
    expect.hasAssertions();
    expectUnknown("readProjectFile", "ENOENT: /Users/alice/private-repo");
  });

  it("routes exact unhandled write EPIPE through the generic supervisor metric policy", () => {
    expect(classifySupervisorFailure(new Error("write EPIPE"), "supervisor")).toEqual({
      failureClass: "transient-service",
      treatment: "metric",
      level: "warning",
      operational: true,
      domain: "supervisor.runtime",
      operation: "supervisor",
      errorClass: "broken-pipe",
      fingerprint: ["poracode", "supervisor.runtime", "supervisor", "broken-pipe"],
    });
  });

  it("keeps other generic supervisor failures captured with default grouping", () => {
    expect(classifySupervisorFailure(new Error("read EPIPE"), "supervisor")).toMatchObject({
      failureClass: "unknown",
      treatment: "capture",
      errorClass: "error",
      fingerprint: null,
    });
    expect(classifySupervisorFailure(new TypeError("write EPIPE"), "supervisor")).toMatchObject({
      failureClass: "unknown",
      treatment: "capture",
      errorClass: "type-error",
      fingerprint: null,
    });
  });
});

describe("supervisor Sentry event admission", () => {
  it("applies the limiter from the configured beforeSend callback", () => {
    sentryMock.init.mockReset();
    sentryMock.setContext.mockReset();
    const originalDsn = process.env.SENTRY_DSN;
    const originalDataDir = process.env.PORACODE_DATA_DIR;
    mkdirSync("tmp", { recursive: true });
    const directory = mkdtempSync(join(process.cwd(), "tmp", "sentry-supervisor-"));
    process.env.PORACODE_DATA_DIR = directory;
    process.env.SENTRY_DSN = "https://public@example.test/1";

    const moduleLoader = Module as unknown as {
      _load: (request: string, ...rest: unknown[]) => unknown;
    };
    const originalLoad = moduleLoader._load.bind(moduleLoader);
    const loadSpy = vi
      .spyOn(moduleLoader, "_load")
      .mockImplementation((request, ...rest) =>
        request === "@sentry/node" ? sentryMock : originalLoad(request, ...rest),
      );

    try {
      expect(initializeSupervisorSentry({ appVersion: "test", isDev: false })).toBe(true);
      const beforeSend = sentryMock.init.mock.calls[0]?.[0].beforeSend;
      expect(beforeSend).toBeDefined();
      const event = {
        exception: {
          values: [
            {
              type: "Error",
              value: "poll failed",
              stacktrace: {
                frames: [{ function: "pollProject", filename: "/app/supervisor.cjs", lineno: 12 }],
              },
            },
          ],
        },
      };

      expect(beforeSend!(event as never)).not.toBeNull();
      expect(beforeSend!(event as never)).not.toBeNull();
      expect(beforeSend!(event as never)).not.toBeNull();
      expect(beforeSend!(event as never)).toBeNull();
      expect(initializeSupervisorSentry({ appVersion: "test-next", isDev: false })).toBe(true);
      const restarted = sentryMock.init.mock.calls.at(-1)?.[0].beforeSend;
      expect(restarted!(event as never)).toBeNull();
      const ledger = JSON.parse(
        readFileSync(join(directory, "cache", "sentry", "event-budget.json"), "utf8"),
      );
      expect(ledger.processEvents).toHaveLength(3);
    } finally {
      loadSpy.mockRestore();
      if (originalDsn === undefined) {
        delete process.env.SENTRY_DSN;
      } else {
        process.env.SENTRY_DSN = originalDsn;
      }
      if (originalDataDir === undefined) {
        delete process.env.PORACODE_DATA_DIR;
      } else {
        process.env.PORACODE_DATA_DIR = originalDataDir;
      }
      rmSync(directory, { recursive: true, force: true });
      sentryMock.init.mockReset();
      sentryMock.setContext.mockReset();
    }
  });
});
