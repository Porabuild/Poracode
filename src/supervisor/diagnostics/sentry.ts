import {
  prepareSentryEvent,
  type PoracodeDiagnosticTags,
  type SentryEventLike,
} from "@/shared/diagnostics/sentryPrivacy";
import {
  buildDiagnosticBreadcrumb,
  classifyDiagnosticFailure,
  isStableDiagnosticToken,
  type DiagnosticFailureDecision,
  type DiagnosticFailureMetadata,
} from "@/shared/diagnostics/sentryPolicy";
import {
  readBuildSentryDsn,
  readBuildSentryEnvironment,
  shouldEnableSentryReporting,
} from "@/shared/diagnostics/sentryBuildConfig";

type SupervisorSentryModule = typeof import("@sentry/node");

let supervisorSentry: SupervisorSentryModule | null | undefined;

type SupervisorIpcFailureRule = {
  operations: readonly string[] | null;
  signature: string | RegExp;
  failureClass: DiagnosticFailureMetadata["failureClass"];
  errorClass: string;
  errorType?: "type-error";
};

const PROVIDER_GENERATION_OPERATIONS = [
  "extractContext",
  "generateCommitMessage",
  "generatePrSummary",
  "generateTitle",
] as const;
const PROVIDER_PROMPT_OPERATIONS = [
  ...PROVIDER_GENERATION_OPERATIONS,
  "sendThreadInput",
  "startThread",
] as const;
const PROVIDER_AUTH_OPERATIONS = ["authenticateAcpAgent", ...PROVIDER_PROMPT_OPERATIONS] as const;
const GIT_NETWORK_OPERATIONS = [
  "gitFetch",
  "gitPull",
  "gitPullRebase",
  "gitPush",
  "gitSync",
  "gitSyncRebase",
] as const;

const STRUCTURED_RUNTIME_FAILURES = new Map<string, string>([
  ["Structured runtime session creation failed.", "session-creation-failed"],
  ["Structured runtime transport failed.", "transport-failed"],
  ["Structured runtime turn failed.", "turn-failed"],
]);

const SUPERVISOR_IPC_FAILURE_RULES: readonly SupervisorIpcFailureRule[] = [
  {
    operations: ["resizeTerminal"],
    signature: "Cannot resize a pty that has already exited",
    failureClass: "expected-operational",
    errorClass: "terminal-already-exited",
  },
  {
    operations: ["resizeTerminal"],
    signature: "ioctl(2) failed, ENOTTY",
    failureClass: "expected-operational",
    errorClass: "terminal-not-attached",
  },
  {
    operations: ["ghListPrs"],
    signature: 'GitHub CLI is not authenticated. Run "gh auth login" in the terminal.',
    failureClass: "expected-operational",
    errorClass: "github-cli-unauthenticated",
  },
  {
    operations: ["interruptThread"],
    signature: /^no active turn to interrupt$/iu,
    failureClass: "expected-operational",
    errorClass: "no-active-turn",
  },
  {
    operations: ["rollbackThreadConversation"],
    signature: /^.+ does not support checkpoint rollback\.$/u,
    failureClass: "expected-operational",
    errorClass: "checkpoint-rollback-unsupported",
  },
  {
    operations: ["extractContext"],
    signature: /^Cannot extract context from .+: no session resume or scrollback available$/u,
    failureClass: "expected-operational",
    errorClass: "context-extraction-unavailable",
  },
  {
    operations: ["generateTitle"],
    signature: /^No default one-shot model configured for .+$/u,
    failureClass: "expected-operational",
    errorClass: "one-shot-model-unconfigured",
  },
  {
    operations: ["generatePrSummary"],
    signature: "No commits found between branches",
    failureClass: "expected-operational",
    errorClass: "no-commits-between-branches",
  },
  {
    operations: ["ghCreatePr"],
    signature:
      /(?:^|\r?\n)a pull request for branch "[^"\r\n]+" into branch "[^"\r\n]+" already exists:(?:\r?\n|$)/u,
    failureClass: "expected-operational",
    errorClass: "github-pull-request-exists",
  },
  {
    operations: PROVIDER_PROMPT_OPERATIONS,
    signature:
      /^error: failed to run prompt: provider\.api_error: (?:402|403) [^\r\n]*(?:usage limit|quota|billing (?:cycle|limit)|payment required)[\s\S]*$/iu,
    failureClass: "expected-operational",
    errorClass: "provider-quota-exhausted",
  },
  {
    operations: PROVIDER_PROMPT_OPERATIONS,
    signature:
      /^Payment or usage limit reached \(HTTP 402\)\. Check your [A-Za-z0-9][A-Za-z0-9 ._-]* account billing or usage\.$/u,
    failureClass: "expected-operational",
    errorClass: "provider-quota-exhausted",
  },
  {
    operations: PROVIDER_AUTH_OPERATIONS,
    signature: /^(?:Internal error: )?(?:Device|User) authentication (?:failed|required)$/u,
    failureClass: "expected-operational",
    errorClass: "provider-authentication-required",
  },
  {
    operations: ["generateTitle"],
    signature: "session.prompt: Unexpected server error. Check server logs for details.",
    failureClass: "transient-service",
    errorClass: "provider-service-unavailable",
  },
  {
    operations: null,
    signature:
      /(?:^|\r?\n)fatal: not a git repository \(or any of the parent directories\): \.git(?:\r?\n|\p{Cc}|$)/u,
    failureClass: "expected-operational",
    errorClass: "git-not-a-repository",
  },
  {
    operations: GIT_NETWORK_OPERATIONS,
    signature:
      /(?=[\s\S]*(?:Command failed: git|fatal:|error:))[\s\S]*(?:failed to connect|could not connect|could not resolve host|connection (?:reset|timed out)|operation timed out)/iu,
    failureClass: "transient-service",
    errorClass: "git-network-unavailable",
  },
  {
    operations: ["gitPush"],
    signature:
      /(?:\[rejected\][^\r\n]*\(non-fast-forward\)|Updates were rejected because the tip[^\r\n]* is behind)/u,
    failureClass: "expected-operational",
    errorClass: "git-non-fast-forward",
  },
  {
    operations: ["gitCommit"],
    signature:
      /(?:^|\r?\n)(?:husky - )?(?:(?:pre-commit|commit-msg|prepare-commit-msg|post-commit) hook (?:declined|exited with code \d+(?: \(error\))?|failed|rejected)|pre-commit script failed \(code \d+\))(?:\r?\n|\p{Cc}|$)/iu,
    failureClass: "expected-operational",
    errorClass: "git-commit-hook-rejected",
  },
  {
    operations: null,
    signature: "fetch failed",
    failureClass: "transient-service",
    errorClass: "fetch-failed",
    errorType: "type-error",
  },
];

export type SupervisorSentryOptions = {
  appVersion: string;
  isDev: boolean;
};

function loadSupervisorSentry(): SupervisorSentryModule | null {
  if (supervisorSentry !== undefined) {
    return supervisorSentry;
  }

  try {
    supervisorSentry = require("@sentry/node") as SupervisorSentryModule;
  } catch (error) {
    supervisorSentry = null;
    console.warn(
      "[poracode] Sentry supervisor integration unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return supervisorSentry;
}

function readSentryDsn(): string | null {
  const dsn = process.env.SENTRY_DSN || readBuildSentryDsn();
  return dsn && dsn.trim().length > 0 ? dsn.trim() : null;
}

function readSentryEnvironment(options: SupervisorSentryOptions): string {
  return (
    process.env.SENTRY_ENVIRONMENT ||
    readBuildSentryEnvironment() ||
    (options.isDev ? "development" : "production")
  );
}

function buildBaseTags(options: SupervisorSentryOptions): PoracodeDiagnosticTags {
  return {
    "poracode.app_version": options.appVersion,
    "poracode.arch": process.arch,
    "poracode.node": process.versions.node,
    "poracode.platform": process.platform,
    "poracode.process": "supervisor",
  };
}

export function initializeSupervisorSentry(options: SupervisorSentryOptions): boolean {
  const dsn = readSentryDsn();
  if (!dsn || !shouldEnableSentryReporting(dsn, options.isDev)) {
    return false;
  }

  const Sentry = loadSupervisorSentry();
  if (!Sentry) {
    return false;
  }

  Sentry.init({
    dsn,
    release: `poracode@${options.appVersion}`,
    environment: readSentryEnvironment(options),
    sendDefaultPii: false,
    defaultIntegrations: false,
    maxBreadcrumbs: 20,
    normalizeDepth: 4,
    tracesSampleRate: 0,
    debug: process.env.SENTRY_DEBUG === "1",
    initialScope: {
      tags: buildBaseTags(options),
    },
    beforeSend(event) {
      return prepareSentryEvent(event as unknown as SentryEventLike) as unknown as typeof event;
    },
  });

  Sentry.setContext("poracode", {
    appVersion: options.appVersion,
    process: "supervisor",
  });

  return true;
}

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

function structuredRuntimeClassification(error: unknown): DiagnosticFailureMetadata | undefined {
  if (!(error instanceof Error) || error.name !== "StructuredRuntimeDiagnosticError") {
    return undefined;
  }
  const errorClass = STRUCTURED_RUNTIME_FAILURES.get(error.message);
  return errorClass
    ? {
        failureClass: "product-defect",
        domain: "structured-runtime",
        errorClass,
      }
    : undefined;
}

function structuredRuntimeProvider(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.name !== "StructuredRuntimeDiagnosticError") {
    return undefined;
  }
  const provider = (error as Error & { diagnosticProvider?: unknown }).diagnosticProvider;
  return isStableDiagnosticToken(provider) ? provider : undefined;
}

function matchesFailureRule(
  rule: SupervisorIpcFailureRule,
  error: unknown,
  operation: string,
  message: string,
) {
  if (rule.operations && !rule.operations.includes(operation)) return false;
  if (rule.errorType === "type-error" && !(error instanceof TypeError)) return false;
  return typeof rule.signature === "string"
    ? message === rule.signature
    : rule.signature.test(message);
}

function knownSupervisorIpcClassification(
  error: unknown,
  operation: string,
): DiagnosticFailureMetadata | undefined {
  const structuredClassification = structuredRuntimeClassification(error);
  if (structuredClassification) return structuredClassification;
  const message = errorMessage(error);
  if (!message) return undefined;
  const rule = SUPERVISOR_IPC_FAILURE_RULES.find((candidate) =>
    matchesFailureRule(candidate, error, operation, message),
  );
  return rule
    ? {
        failureClass: rule.failureClass,
        domain: "supervisor.ipc",
        errorClass: rule.errorClass,
      }
    : undefined;
}

export function classifySupervisorIpcFailure(
  error: unknown,
  operation: string,
): DiagnosticFailureDecision {
  return classifyDiagnosticFailure(
    error,
    { domain: "supervisor.ipc", operation },
    knownSupervisorIpcClassification(error, operation),
  );
}

export function classifySupervisorFailure(
  error: unknown,
  operation: string,
): DiagnosticFailureDecision {
  const knownClassification: DiagnosticFailureMetadata | undefined =
    structuredRuntimeClassification(error) ??
    (error instanceof Error && error.name === "Error" && error.message === "write EPIPE"
      ? {
          failureClass: "transient-service",
          domain: "supervisor.runtime",
          errorClass: "broken-pipe",
        }
      : undefined);
  return classifyDiagnosticFailure(error, { domain: "supervisor", operation }, knownClassification);
}

function captureSupervisorFailure(
  error: unknown,
  decision: DiagnosticFailureDecision,
  tags?: PoracodeDiagnosticTags,
): void {
  if (decision.treatment === "drop") return;
  const Sentry = loadSupervisorSentry();
  if (!Sentry) return;
  if (!Sentry.isEnabled()) return;

  const diagnosticTags: PoracodeDiagnosticTags = {
    ...tags,
    "poracode.error_class": decision.errorClass,
    "poracode.failure_domain": decision.domain,
    "poracode.operation": decision.operation,
    "poracode.operational": String(decision.operational),
    "poracode.process": "supervisor",
  };
  if (decision.treatment === "metric") {
    Sentry.metrics.count("poracode.diagnostic.failure", 1, {
      attributes: {
        domain: decision.domain,
        error_class: decision.errorClass,
        level: decision.level ?? "warning",
        operation: decision.operation,
        operational: decision.operational,
        process: "supervisor",
      },
    });
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTags(diagnosticTags);
    if (decision.fingerprint) {
      scope.setFingerprint(decision.fingerprint);
    }
    scope.setLevel(decision.level ?? "error");
    scope.addBreadcrumb(
      buildDiagnosticBreadcrumb({
        domain: decision.domain,
        operation: decision.operation,
        state: "failed",
        transition: decision.failureClass,
        level: decision.level ?? "error",
      }),
      20,
    );
    Sentry.captureException(error);
  });
}

export function captureSupervisorIpcFailure(error: unknown, operation: string): void {
  const provider = structuredRuntimeProvider(error);
  captureSupervisorFailure(error, classifySupervisorIpcFailure(error, operation), {
    "poracode.feature_area": "supervisor-ipc",
    ...(provider ? { "poracode.provider": provider } : {}),
  });
}

export function captureSupervisorException(error: unknown, tags?: PoracodeDiagnosticTags): void {
  const operation = tags?.["poracode.feature_area"] ?? "unhandled";
  const provider = tags?.["poracode.provider"] ?? structuredRuntimeProvider(error);
  captureSupervisorFailure(error, classifySupervisorFailure(error, operation), {
    ...tags,
    ...(provider ? { "poracode.provider": provider } : {}),
  });
}

export async function flushSupervisorSentry(timeoutMs = 2000): Promise<void> {
  const Sentry = loadSupervisorSentry();
  if (!Sentry) return;
  if (!Sentry.isEnabled()) return;
  await Sentry.flush(timeoutMs);
}
