import * as Sentry from "@sentry/electron/renderer";
import { readBridge } from "@/renderer/bridge";
import {
  buildRuntimeDiagnosticTags,
  sanitizeSentryEvent,
  type PoracodeDiagnosticTags,
  type PoracodeRuntimeDiagnosticContext,
  type SentryEventLike,
} from "@/shared/diagnostics/sentryPrivacy";

const DISABLED_INTEGRATIONS = new Set([
  "Breadcrumbs",
  "CaptureConsole",
  "Console",
  "HttpContext",
  "ReportingObserver",
]);

function buildBaseTags(): PoracodeDiagnosticTags {
  const bridge = readBridge();
  return {
    "poracode.app_version": bridge.appVersion,
    "poracode.channel": bridge.channel,
    "poracode.electron": bridge.electronVersion,
    "poracode.platform": bridge.platform,
    "poracode.process": "renderer",
  };
}

export function initializeRendererSentry(): boolean {
  const bridge = readBridge();
  if (!bridge.sentryEnabled) {
    return false;
  }

  Sentry.init({
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    normalizeDepth: 4,
    tracesSampleRate: 0,
    initialScope: {
      tags: buildBaseTags(),
    },
    beforeBreadcrumb() {
      return null;
    },
    beforeSend(event) {
      return sanitizeSentryEvent(event as unknown as SentryEventLike) as unknown as typeof event;
    },
    integrations(defaultIntegrations) {
      return defaultIntegrations.filter(
        (integration) => !DISABLED_INTEGRATIONS.has(integration.name),
      );
    },
  });

  Sentry.setContext("poracode", {
    appVersion: bridge.appVersion,
    channel: bridge.channel,
    isDev: bridge.isDev,
    process: "renderer",
  });

  return true;
}

export function setRendererRuntimeDiagnosticContext(
  context: PoracodeRuntimeDiagnosticContext,
): void {
  if (!Sentry.isEnabled()) return;
  Sentry.getCurrentScope().setTags(buildRuntimeDiagnosticTags(context));
}

export function captureRendererException(
  error: unknown,
  context?: PoracodeRuntimeDiagnosticContext,
): void {
  if (!Sentry.isEnabled()) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setTags(buildRuntimeDiagnosticTags(context));
    }
    Sentry.captureException(error);
  });
}
