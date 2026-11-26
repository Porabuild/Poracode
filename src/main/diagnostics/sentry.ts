import { app } from "electron";
import { join } from "node:path";
import { createPersistentSentryEventLimiter } from "@/host/diagnostics/sentryEventLedger";
import { createCrashReportConsentReader } from "@/host/diagnostics/crashReportConsent";
import { isCrashReportsDisabledByEnv } from "@/shared/telemetryConsent";
import type { PoracodeChannel } from "@/shared/channel";
import {
  sentryDataCollection,
  type PoracodeDiagnosticTags,
  type SentryEventLike,
} from "@/shared/diagnostics/sentryPrivacy";
import {
  readBuildSentryDsn,
  readBuildSentryEnvironment,
  shouldEnableSentryReporting,
} from "@/shared/diagnostics/sentryBuildConfig";
import { prepareMainSentryEvent } from "./mainEvent";
import { buildErrorCauseTags } from "@/shared/diagnostics/errorCause";

const DISABLED_INTEGRATIONS = new Set([
  // Release-health sessions bypass beforeSend, so they must never start:
  // the per-event consent gate below cannot stop them.
  "BrowserWindowSession",
  "MainProcessSession",
  "ChildProcess",
  "Console",
  "ContextLines",
  "ElectronBreadcrumbs",
  "ElectronNet",
  "LocalVariables",
  "Screenshots",
]);

/**
 * Native crash dumps are unscrubbed memory snapshots. Only the minidump
 * attachment for a native crash event may leave the machine, and only with the
 * separate raw-dump opt-in; every other attachment is dropped. Mutates the hint
 * array in place: Sentry builds the envelope from this hint after `beforeSend`.
 */
function filterMainSentryAttachments(
  event: SentryEventLike & { platform?: unknown },
  hint: { attachments?: Array<{ attachmentType?: string }> } | undefined,
  nativeCrashDumps: boolean,
): void {
  const attachments = hint?.attachments;
  if (!attachments || attachments.length === 0) return;
  const keepMinidump = nativeCrashDumps && event.platform === "native";
  for (let index = attachments.length - 1; index >= 0; index -= 1) {
    const attachmentType = attachments[index]?.attachmentType;
    if (!keepMinidump || attachmentType !== "event.minidump") {
      attachments.splice(index, 1);
    }
  }
}

type MainSentryModule = typeof import("@sentry/electron/main");

let mainSentry: MainSentryModule | null | undefined;
// Set only after `Sentry.init` runs. The SDK (plus its OpenTelemetry and
// require-in-the-middle graph) costs ~100ms of synchronous main-thread work to
// load, so capture paths must not pull it in just to learn it is disabled.
let mainSentryInitialized = false;

export type MainSentryOptions = {
  appVersion: string;
  isDev: boolean;
  channel: PoracodeChannel;
  /** Shared settings file holding crash-report consent; null fails closed. */
  settingsPath?: string | null;
};

function loadMainSentry(): MainSentryModule | null {
  if (mainSentry !== undefined) {
    return mainSentry;
  }

  try {
    mainSentry = require("@sentry/electron/main") as MainSentryModule;
  } catch (error) {
    mainSentry = null;
    console.warn(
      "[poracode] Sentry main process integration unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return mainSentry;
}

function readSentryDsn(): string | null {
  const dsn = process.env.SENTRY_DSN || readBuildSentryDsn();
  return dsn && dsn.trim().length > 0 ? dsn.trim() : null;
}

function readSentryEnvironment(options: MainSentryOptions): string {
  return (
    process.env.SENTRY_ENVIRONMENT ||
    readBuildSentryEnvironment() ||
    (options.isDev ? "development" : "production")
  );
}

function shouldEnableSentry(options: MainSentryOptions): boolean {
  return (
    shouldEnableSentryReporting(readSentryDsn(), options.isDev) &&
    !isCrashReportsDisabledByEnv(process.env)
  );
}

function buildBaseTags(options: MainSentryOptions): PoracodeDiagnosticTags {
  return {
    "poracode.app_version": options.appVersion,
    "poracode.arch": process.arch,
    "poracode.channel": options.channel,
    "poracode.chrome": process.versions.chrome ?? "unknown",
    "poracode.electron": process.versions.electron ?? "unknown",
    "poracode.node": process.versions.node,
    "poracode.platform": process.platform,
    "poracode.process": "main",
  };
}

export function isSentryConfigured(options: MainSentryOptions): boolean {
  return shouldEnableSentry(options);
}

export function initializeMainSentry(options: MainSentryOptions): boolean {
  const dsn = readSentryDsn();
  if (!dsn || !shouldEnableSentry(options)) {
    return false;
  }

  const Sentry = loadMainSentry();
  if (!Sentry) {
    return false;
  }

  const readCrashReportConsent = createCrashReportConsentReader(options.settingsPath);
  const shouldSendMainSentryEvent = createPersistentSentryEventLimiter(
    join(app.getPath("userData"), "sentry", "event-budget.json"),
  );
  Sentry.init({
    // The default Electron transport queues envelopes on disk and replays
    // them at startup without re-running beforeSend, which would resurrect
    // events captured before an opt-out (or before this consent flow
    // existed). The plain net transport sends or drops in-process only.
    transport: Sentry.makeElectronTransport,
    sendClientReports: false,
    dsn,
    release: `poracode@${options.appVersion}`,
    environment: readSentryEnvironment(options),
    dataCollection: sentryDataCollection,
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    attachScreenshot: false,
    maxBreadcrumbs: 0,
    normalizeDepth: 4,
    tracesSampleRate: 0,
    debug: process.env.SENTRY_DEBUG === "1",
    initialScope: {
      tags: buildBaseTags(options),
    },
    beforeBreadcrumb() {
      return null;
    },
    beforeSend(event, hint) {
      // Consent is checked per event, with ordinary reports and raw dumps read
      // from one snapshot. Opting out stops sending without a restart, and
      // revoking raw dumps keeps the scrubbed native crash summary.
      const consent = readCrashReportConsent();
      if (!consent.crashReports) return null;
      const prepared = prepareMainSentryEvent(
        event as unknown as SentryEventLike,
        process.platform,
      );
      if (!prepared || !shouldSendMainSentryEvent(prepared)) return null;
      filterMainSentryAttachments(
        prepared as unknown as SentryEventLike & { platform?: unknown },
        hint,
        consent.nativeCrashDumps,
      );
      return prepared as unknown as typeof event;
    },
    integrations(defaultIntegrations) {
      return defaultIntegrations.filter(
        (integration) => !DISABLED_INTEGRATIONS.has(integration.name),
      );
    },
  });

  mainSentryInitialized = true;

  Sentry.setContext("poracode", {
    appVersion: options.appVersion,
    channel: options.channel,
    packaged: app.isPackaged,
    process: "main",
  });

  return true;
}

export function captureMainException(
  error: unknown,
  tags?: PoracodeDiagnosticTags,
  fingerprint?: string[],
): void {
  if (!mainSentryInitialized) return;
  const Sentry = loadMainSentry();
  if (!Sentry) return;
  if (!Sentry.isEnabled()) return;
  Sentry.withScope((scope) => {
    scope.setTags({ ...tags, ...buildErrorCauseTags(error) });
    if (fingerprint) {
      scope.setFingerprint(fingerprint);
    }
    Sentry.captureException(error);
  });
}
