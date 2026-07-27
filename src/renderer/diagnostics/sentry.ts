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

const RUNTIME_TAG_KEYS = [
  "poracode.provider",
  "poracode.presentation",
  "poracode.runtime_kind",
  "poracode.feature_area",
] as const;

const MAX_REACT_COMPONENTS = 32;
const SAFE_COMPONENT_NAME = /^[A-Za-z_$][A-Za-z0-9_$.-]{0,79}$/;
const UNFOCUSED_CLIPBOARD_WRITE_MESSAGE =
  "Failed to execute 'writeText' on 'Clipboard': Document is not focused.";
const EXPECTED_FILE_NOT_FOUND_MESSAGE = /^File not found: .+$/;

type RendererExceptionValue = NonNullable<
  NonNullable<SentryEventLike["exception"]>["values"]
>[number] & {
  type?: string;
};

function isUnfocusedClipboardWriteRace(event: SentryEventLike): boolean {
  return (
    event.exception?.values?.some((value) => {
      const exception = value as RendererExceptionValue;
      return (
        exception.type === "NotAllowedError" &&
        exception.value === UNFOCUSED_CLIPBOARD_WRITE_MESSAGE
      );
    }) ?? false
  );
}

function isHandledStaleFileEditorEvent(event: SentryEventLike): boolean {
  if (event.tags?.["poracode.feature_area"] !== "file-editor") return false;
  return (
    event.exception?.values?.some((value) => {
      const exception = value as RendererExceptionValue;
      return (
        exception.mechanism?.handled === true &&
        typeof exception.value === "string" &&
        EXPECTED_FILE_NOT_FOUND_MESSAGE.test(exception.value)
      );
    }) ?? false
  );
}

export function prepareRendererSentryEvent<T extends SentryEventLike>(event: T): T | null {
  if (isUnfocusedClipboardWriteRace(event) || isHandledStaleFileEditorEvent(event)) {
    return null;
  }
  return sanitizeSentryEvent(event);
}

export function extractSafeReactComponentTree(componentStack: string): string[] {
  const components: string[] = [];
  for (const line of componentStack.split(/\r?\n/)) {
    const match = line.match(/^\s*at\s+([^\s(]+)/);
    const component = match?.[1];
    if (!component || !SAFE_COMPONENT_NAME.test(component)) continue;
    components.push(component);
    if (components.length >= MAX_REACT_COMPONENTS) break;
  }
  return components;
}

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
      return prepareRendererSentryEvent(event as unknown as SentryEventLike) as unknown as
        | typeof event
        | null;
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
  context: PoracodeRuntimeDiagnosticContext | null,
): void {
  if (!Sentry.isEnabled()) return;
  const scope = Sentry.getCurrentScope();
  const tags = context ? buildRuntimeDiagnosticTags(context) : {};
  for (const key of RUNTIME_TAG_KEYS) {
    scope.setTag(key, tags[key]);
  }
}

export function captureRendererException(
  error: unknown,
  context?: PoracodeRuntimeDiagnosticContext,
  componentStack?: string,
): void {
  if (!Sentry.isEnabled()) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setTags(buildRuntimeDiagnosticTags(context));
    }
    if (componentStack) {
      const reactComponents = extractSafeReactComponentTree(componentStack);
      if (reactComponents.length > 0) {
        scope.setContext("poracode", { react_components: reactComponents });
      }
    }
    Sentry.captureException(error);
  });
}
