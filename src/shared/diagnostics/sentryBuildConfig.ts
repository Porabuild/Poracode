declare const __BUILD_SENTRY_DSN__: string | undefined;
declare const __BUILD_SENTRY_ENVIRONMENT__: string | undefined;

function readBuildValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function readBuildSentryDsn(): string | null {
  return readBuildValue(typeof __BUILD_SENTRY_DSN__ === "undefined" ? null : __BUILD_SENTRY_DSN__);
}

export function readBuildSentryEnvironment(): string | null {
  return readBuildValue(
    typeof __BUILD_SENTRY_ENVIRONMENT__ === "undefined" ? null : __BUILD_SENTRY_ENVIRONMENT__,
  );
}

export function shouldEnableSentryReporting(dsn: string | null, isDev: boolean): boolean {
  return Boolean(dsn) && !isDev;
}
