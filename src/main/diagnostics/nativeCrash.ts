import type { SentryEventLike } from "@/shared/diagnostics/sentryPrivacy";

export type NativeCrashTreatment = {
  drop: boolean;
  fingerprint?: string[];
};

function stringField(record: unknown, key: string): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function crashpadStackDump(event: SentryEventLike): string | undefined {
  return (
    stringField(event.contexts?.electron, "crashpad.Stack dump") ??
    stringField(event.contexts?.["swift-frontend"], "Stack dump")
  );
}

function isProvenExternalSwiftFrontend(event: SentryEventLike): boolean {
  if (event.platform !== "native" || event.tags?.["event.process"] !== "unknown") return false;
  const stackDump = crashpadStackDump(event);
  if (!stackDump) return false;
  const firstLine = stackDump.split(/\r?\n/, 1)[0] ?? "";
  return /^0\.\s*Program arguments:\s+\/Applications\/Xcode\.app\/Contents\/Developer\/Toolchains\/\S+\/usr\/bin\/swift-frontend(?:\s|$)/.test(
    firstLine,
  );
}

function isGpuFatal(event: SentryEventLike): boolean {
  if (event.platform !== "native" || event.tags?.["event.process"] !== "browser") return false;
  for (const context of Object.values(event.contexts ?? {})) {
    const fatal = stringField(context, "crashpad.LOG_FATAL") ?? stringField(context, "LOG_FATAL");
    if (fatal?.includes("GPU process isn't usable")) return true;
  }
  return false;
}

function isNativeOutOfMemory(event: SentryEventLike): boolean {
  if (event.platform !== "native") return false;
  if (event.tags?.["exit.reason"] === "oom") return true;
  const values = event.exception?.values as
    | Array<{ type?: unknown; value?: string; mechanism?: Record<string, unknown> }>
    | undefined;
  return values?.some((value) => value.type === "OutOfMemoryError") ?? false;
}

export function classifyNativeCrashEvent(
  event: SentryEventLike,
  platform: NodeJS.Platform,
): NativeCrashTreatment {
  if (isProvenExternalSwiftFrontend(event)) {
    return { drop: true };
  }
  if (isGpuFatal(event)) {
    return {
      drop: false,
      fingerprint: ["poracode-native-crash", platform, "gpu-fatal"],
    };
  }
  if (isNativeOutOfMemory(event)) {
    return {
      drop: false,
      fingerprint: ["poracode-native-crash", platform, "out-of-memory"],
    };
  }
  return { drop: false };
}
