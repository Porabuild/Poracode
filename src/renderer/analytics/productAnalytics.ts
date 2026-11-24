import type {
  ProductAnalyticsEventName,
  ProductAnalyticsProperties,
} from "@/shared/analytics/posthogPrivacy";
import { readBridge } from "@/renderer/bridge";
import { createPostHogClient, type PostHogClientConfig } from "./posthogClient";
import { isProductAnalyticsConsented } from "./telemetryConsentState";

const INSTALL_ID_STORAGE_KEY = "poracode-posthog-anonymous-id";

function readBuildEnv(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBooleanBuildEnv(value: unknown): boolean | null {
  const text = readBuildEnv(value);
  if (!text) return null;
  return text !== "0" && text !== "false";
}

function resolvePostHogConfig(): PostHogClientConfig {
  const bridge = readBridge();
  const runtimeKey = bridge.posthogKey?.trim() ?? "";
  const buildKey = readBuildEnv(import.meta.env.VITE_POSTHOG_KEY);
  const apiKey = runtimeKey || buildKey;
  const host =
    bridge.posthogHost?.trim() ||
    readBuildEnv(import.meta.env.VITE_POSTHOG_HOST) ||
    "https://us.i.posthog.com";
  const explicitEnabled = readBooleanBuildEnv(import.meta.env.VITE_POSTHOG_ENABLED);
  const enableDev =
    bridge.posthogEnableDev === true ||
    readBooleanBuildEnv(import.meta.env.VITE_POSTHOG_ENABLE_DEV) === true;

  return {
    apiKey,
    host: host.replace(/\/+$/, ""),
    enabled:
      Boolean(apiKey) &&
      bridge.posthogEnabled !== false &&
      explicitEnabled !== false &&
      (!bridge.isDev || enableDev || bridge.posthogEnableDev),
  };
}

function resolveInstallId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_ID_STORAGE_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(INSTALL_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

function buildBaseProperties(sessionId: string): ProductAnalyticsProperties {
  const bridge = readBridge();
  return {
    // PostHog must not derive IP or geo-location from the request, and must
    // not build a person profile around the anonymous install id.
    $geoip_disable: true,
    $ip: null,
    $process_person_profile: false,
    app_version: bridge.appVersion,
    arch: bridge.arch,
    channel: bridge.channel,
    chrome: bridge.chromeVersion,
    electron: bridge.electronVersion,
    is_dev: bridge.isDev,
    node: bridge.nodeVersion,
    platform: bridge.platform,
    $session_id: sessionId,
  };
}

const client = createPostHogClient({
  resolveConfig: resolvePostHogConfig,
  resolveInstallId,
  buildBaseProperties,
  createEventId: () => crypto.randomUUID(),
  createSessionId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  fetch: (input, init) => fetch(input, init),
  isConsentGranted: isProductAnalyticsConsented,
});

export function configureProductAnalytics(): boolean {
  return client.configure();
}

export function captureProductEvent(
  event: ProductAnalyticsEventName,
  properties: ProductAnalyticsProperties = {},
): void {
  client.capture(event, properties);
}

export function flushProductAnalytics(): Promise<void> {
  return client.flush();
}

/** Drops buffered events immediately; used when analytics is turned off. */
export function clearProductAnalyticsBuffer(): void {
  client.clearBuffer();
}
