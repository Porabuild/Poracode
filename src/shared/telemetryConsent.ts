/**
 * Single consent contract for every telemetry egress in Poracode.
 *
 * Rules (see docs/TELEMETRY.md):
 * - Product analytics and crash reports are opt-in. Nothing is sent until the
 *   user has explicitly turned a stream on (`consentDecided` records that the
 *   first-run choice was shown; the booleans are the choice).
 * - Environment hard-off switches always win over the stored choice, so a
 *   managed or CI environment can guarantee silence without touching settings:
 *   `PORACODE_TELEMETRY_ENABLED=0`, `DO_NOT_TRACK=1`, or a CI environment.
 * - Stream-specific legacy switches keep working: `POSTHOG_ENABLED=0` for
 *   product analytics and `PORACODE_CRASH_REPORTS_ENABLED=0` for Sentry.
 */

export interface TelemetryConsent {
  /** Allowlisted product analytics events (PostHog). Off until opted in. */
  productAnalytics: boolean;
  /** Scrubbed crash diagnostics (Sentry). Off until opted in. */
  crashReports: boolean;
  /** The user has seen and answered the first-run telemetry choice. */
  consentDecided: boolean;
}

export const DEFAULT_TELEMETRY_CONSENT: TelemetryConsent = {
  productAnalytics: false,
  crashReports: false,
  consentDecided: false,
};

const FALSEY_ENV_VALUES = new Set(["0", "false", "no", "off"]);
const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function envValue(env: Record<string, string | undefined>, key: string): string {
  return (env[key] ?? "").trim().toLowerCase();
}

/** True when the environment forbids every telemetry stream. */
export function isTelemetryHardDisabledByEnv(env: Record<string, string | undefined>): boolean {
  if (FALSEY_ENV_VALUES.has(envValue(env, "PORACODE_TELEMETRY_ENABLED"))) return true;
  if (TRUTHY_ENV_VALUES.has(envValue(env, "DO_NOT_TRACK"))) return true;
  // CI runners are not product users; never count or report on them.
  if (TRUTHY_ENV_VALUES.has(envValue(env, "CI"))) return true;
  return false;
}

/** True when the environment forbids product analytics specifically. */
export function isProductAnalyticsDisabledByEnv(env: Record<string, string | undefined>): boolean {
  return (
    isTelemetryHardDisabledByEnv(env) || FALSEY_ENV_VALUES.has(envValue(env, "POSTHOG_ENABLED"))
  );
}

/** True when the environment forbids crash reports specifically. */
export function isCrashReportsDisabledByEnv(env: Record<string, string | undefined>): boolean {
  if (isTelemetryHardDisabledByEnv(env)) return true;
  if (FALSEY_ENV_VALUES.has(envValue(env, "PORACODE_CRASH_REPORTS_ENABLED"))) return true;
  // `SENTRY_DSN=off` is the explicit kill switch; an empty value keeps the
  // historical "fall back to the build DSN" behavior for unset variables.
  return FALSEY_ENV_VALUES.has(envValue(env, "SENTRY_DSN"));
}

/**
 * Reads a consent object out of an unknown settings document. Missing or
 * malformed values fail closed to the opt-in default (off, undecided), which
 * is how pre-consent settings files migrate: telemetry stops until the user
 * makes an explicit choice.
 */
export function telemetryConsentFromPrivacy(value: unknown): TelemetryConsent {
  if (!value || typeof value !== "object") return { ...DEFAULT_TELEMETRY_CONSENT };
  const record = value as Record<string, unknown>;
  return {
    productAnalytics: record.productAnalytics === true,
    crashReports: record.crashReports === true,
    consentDecided: record.consentDecided === true,
  };
}
