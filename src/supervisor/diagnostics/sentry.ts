import {
  sanitizeSentryEvent,
  type PoracodeDiagnosticTags,
  type SentryEventLike,
} from "@/shared/diagnostics/sentryPrivacy";
import {
  readBuildSentryDsn,
  readBuildSentryEnvironment,
} from "@/shared/diagnostics/sentryBuildConfig";

type SupervisorSentryModule = typeof import("@sentry/node");

let supervisorSentry: SupervisorSentryModule | null | undefined;

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
  if (!dsn) {
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
    maxBreadcrumbs: 0,
    normalizeDepth: 4,
    tracesSampleRate: 0,
    debug: process.env.SENTRY_DEBUG === "1",
    initialScope: {
      tags: buildBaseTags(options),
    },
    beforeSend(event) {
      return sanitizeSentryEvent(event as unknown as SentryEventLike) as unknown as typeof event;
    },
  });

  Sentry.setContext("poracode", {
    appVersion: options.appVersion,
    process: "supervisor",
  });

  return true;
}

export function captureSupervisorException(error: unknown, tags?: PoracodeDiagnosticTags): void {
  const Sentry = loadSupervisorSentry();
  if (!Sentry) return;
  if (!Sentry.isEnabled()) return;
  Sentry.withScope((scope) => {
    if (tags) {
      scope.setTags(tags);
    }
    Sentry.captureException(error);
  });
}

export async function flushSupervisorSentry(timeoutMs = 2000): Promise<void> {
  const Sentry = loadSupervisorSentry();
  if (!Sentry) return;
  if (!Sentry.isEnabled()) return;
  await Sentry.flush(timeoutMs);
}
