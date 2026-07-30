import { isSupportedCursorSdkPackageVersion } from "@/shared/agents/cursorSdkPackage";
import { compareVersions } from "@/shared/changelog";

const CURSOR_SDK_MIN_NODE = [22, 13, 0] as const;

export type CursorSdkDiagnosticCode =
  | "auth_invalid"
  | "auth_missing"
  | "configured_path_invalid"
  | "cross_environment_unsupported"
  | "module_api_incompatible"
  | "module_load_failed"
  | "node_incompatible"
  | "package_invalid"
  | "package_missing"
  | "platform_helper_incompatible"
  | "platform_helper_missing"
  | "platform_unsupported"
  | "version_incompatible";

export interface CursorSdkDiagnostic {
  code: CursorSdkDiagnosticCode;
  message: string;
  recoverable: boolean;
  details?: Readonly<Record<string, string | readonly string[]>>;
}

export type CursorSdkPackageSource =
  | "configured"
  | "project"
  | "node-path"
  | "global-explicit"
  | "global-inferred"
  | "global-npm"
  | "global-pnpm";

export type CursorSdkAuthSource = "option" | "environment";

export type CursorSdkExecutionEnvironment = { kind: "native" } | { kind: "wsl"; distro: string };

/**
 * Deliberately structural: Poracode does not depend on or bundle
 * `@cursor/sdk`. The session adapter can narrow additional SDK features at
 * its own boundary while the loader verifies the stable entry points it
 * needs to start or resume a local agent.
 */
export interface CursorSdkModule {
  readonly Agent: CursorSdkAgentApi;
  readonly Cursor: CursorSdkNamespaceApi;
  readonly [name: string]: unknown;
}

export interface CursorSdkAgentApi {
  create(options: unknown): Promise<unknown>;
  resume(agentId: string, options?: unknown): Promise<unknown>;
  readonly [name: string]: unknown;
}

export interface CursorSdkNamespaceApi {
  readonly models: {
    list(options?: unknown): Promise<unknown>;
    readonly [name: string]: unknown;
  };
  readonly [name: string]: unknown;
}

export interface CursorSdkLoadedPackage {
  module: CursorSdkModule;
  packageRoot: string;
  packageJsonPath: string;
  entryPath: string;
  version: string;
  source: CursorSdkPackageSource;
  platformHelper: {
    name: string;
    packageRoot: string;
    version: string;
  };
  authSource: CursorSdkAuthSource;
}

export type CursorSdkLoadResult =
  | { ok: true; value: CursorSdkLoadedPackage }
  | { ok: false; diagnostic: CursorSdkDiagnostic };

export function cursorSdkPlatformPackageName(
  platform: NodeJS.Platform,
  arch: string,
): string | undefined {
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) {
    return `@cursor/sdk-darwin-${arch}`;
  }
  if (platform === "linux" && (arch === "arm64" || arch === "x64")) {
    return `@cursor/sdk-linux-${arch}`;
  }
  if (platform === "win32" && arch === "x64") return "@cursor/sdk-win32-x64";
  return undefined;
}

export function isSupportedCursorSdkNodeVersion(version: string): boolean {
  const parsed = parseCursorSdkVersion(version);
  if (!parsed) return false;
  return compareVersion(parsed, CURSOR_SDK_MIN_NODE) >= 0;
}

/** Thin alias over the shared window so the loader and the npm probe agree. */
export function isSupportedCursorSdkVersion(version: string): boolean {
  return isSupportedCursorSdkPackageVersion(version);
}

export function classifyCursorSdkRuntimeError(error: unknown): CursorSdkDiagnostic | undefined {
  const record = isCursorSdkObjectLike(error) ? error : undefined;
  const name = typeof record?.name === "string" ? record.name : "";
  const code = typeof record?.code === "string" ? record.code : "";
  const status = typeof record?.status === "number" ? record.status : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (
    name === "AuthenticationError" ||
    status === 401 ||
    /(?:unauthenticated|(?:bad|invalid)[_ -]?(?:user[_ -]?)?api[_ -]?key|authentication)/i.test(
      code,
    )
  ) {
    return {
      code: "auth_invalid",
      message: "Cursor rejected the configured SDK API key.",
      recoverable: true,
    };
  }

  const helper = message.match(/@cursor\/sdk-(?:darwin|linux|win32)-(?:arm64|x64)/)?.[0];
  if (
    helper &&
    (code === "ERR_MODULE_NOT_FOUND" ||
      code === "MODULE_NOT_FOUND" ||
      /(?:cannot find|could not resolve|missing)/i.test(message))
  ) {
    return {
      code: "platform_helper_missing",
      message: `The Cursor SDK platform helper ${helper} is missing.`,
      recoverable: true,
      details: { platformHelper: helper },
    };
  }

  return undefined;
}

export function cursorSdkFailure(
  code: CursorSdkDiagnosticCode,
  message: string,
  recoverable: boolean,
  details?: Readonly<Record<string, string | readonly string[]>>,
): { ok: false; diagnostic: CursorSdkDiagnostic } {
  return {
    ok: false,
    diagnostic: {
      code,
      message,
      recoverable,
      ...(details ? { details } : {}),
    },
  };
}

export function validateCursorSdkModule(
  imported: unknown,
): { ok: true; module: CursorSdkModule } | { ok: false; missing: string[] } {
  const direct = isCursorSdkObjectLike(imported) ? imported : undefined;
  const fallback = direct && isCursorSdkObjectLike(direct.default) ? direct.default : undefined;
  const candidate =
    direct && hasCursorSdkCoreShape(direct)
      ? direct
      : fallback && hasCursorSdkCoreShape(fallback)
        ? fallback
        : (direct ?? fallback);
  const missing: string[] = [];

  const agent = candidate && isCursorSdkObjectLike(candidate.Agent) ? candidate.Agent : undefined;
  if (!agent || typeof agent.create !== "function") missing.push("Agent.create");
  if (!agent || typeof agent.resume !== "function") missing.push("Agent.resume");

  const cursor =
    candidate && isCursorSdkObjectLike(candidate.Cursor) ? candidate.Cursor : undefined;
  const models = cursor && isCursorSdkObjectLike(cursor.models) ? cursor.models : undefined;
  if (!models || typeof models.list !== "function") missing.push("Cursor.models.list");

  return missing.length === 0
    ? { ok: true, module: candidate as unknown as CursorSdkModule }
    : { ok: false, missing };
}

export function resolveCursorSdkAuthSource(
  apiKey: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): CursorSdkAuthSource | undefined {
  if (apiKey?.trim()) return "option";
  if (env.CURSOR_API_KEY?.trim()) return "environment";
  return undefined;
}

export function parseCursorSdkVersion(version: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function isCursorSdkObjectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

export function safeCursorSdkErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}

/**
 * `parseCursorSdkVersion` already rejects malformed input, so the ordering
 * itself can reuse the shared numeric-segment comparison.
 */
function compareVersion(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return compareVersions(left.join("."), right.join("."));
}

function hasCursorSdkCoreShape(value: Record<PropertyKey, unknown>): boolean {
  const agent = isCursorSdkObjectLike(value.Agent) ? value.Agent : undefined;
  const cursor = isCursorSdkObjectLike(value.Cursor) ? value.Cursor : undefined;
  const models = cursor && isCursorSdkObjectLike(cursor.models) ? cursor.models : undefined;
  return (
    typeof agent?.create === "function" &&
    typeof agent.resume === "function" &&
    typeof models?.list === "function"
  );
}
