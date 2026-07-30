import { describe, expect, it } from "vitest";
import {
  classifySupervisorFailure,
  classifySupervisorIpcFailure,
  initializeSupervisorSentry,
} from "./sentry";

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
    ({ message }) => {
      expect.hasAssertions();
      expectUnknown("readProjectFile", message);
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
