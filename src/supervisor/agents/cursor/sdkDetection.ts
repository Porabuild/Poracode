import { authStateForPresentation, capabilitiesForPresentation } from "@/shared/agentSelection";
import type { AgentCapability, AgentStatus, AuthState } from "@/shared/contracts";
import { assertAgentLaunchAllowed } from "@/supervisor/agentLaunchGuard";
import { detectProbeLocation, type AgentEnvContext } from "../base";
import {
  forgetCursorSdkInstallPin,
  readCursorSdkInstallPin,
  recordCursorSdkInstallPin,
  shouldRecordCursorSdkInstall,
} from "./sdkInstallPin";
import { cursorSdkGuiCapabilities, type CursorSdkModel } from "./sdkModels";
import { CURSOR_SDK_SESSION_PREFIX, type CursorStructuredRuntime } from "./structuredRuntime";
import {
  CursorSdkWorkerRpcError,
  spawnCursorSdkWorker,
  type CursorSdkWorkerClient,
  type CursorSdkWorkerSpawnOptions,
} from "./sdkWorkerClient";

const NOT_INSTALLED_CODES = new Set([
  "configured_path_invalid",
  "module_api_incompatible",
  "module_load_failed",
  "node_incompatible",
  "package_invalid",
  "package_missing",
  "platform_helper_incompatible",
  "platform_helper_missing",
  "platform_unsupported",
  "version_incompatible",
]);

const MISSING_AUTH_CODES = new Set([
  "auth_invalid",
  "auth_missing",
  "401",
  "403",
  "unauthenticated",
  "bad_api_key",
  "bad_user_api_key",
]);

export interface CursorSdkRuntimeProbe {
  installed: boolean;
  authState: AuthState;
  models: CursorSdkModel[];
  version?: string;
  source?: string;
  diagnosticCode?: string;
  diagnosticMessage?: string;
  authenticatedAs?: string;
}

export interface CursorSdkDetectionDependencies {
  spawnWorker?(
    options: CursorSdkWorkerSpawnOptions,
  ): Promise<
    Pick<CursorSdkWorkerClient, "probe" | "dispose"> &
      Partial<Pick<CursorSdkWorkerClient, "terminate">>
  >;
}

/**
 * Merge independently detected CLI and SDK availability into one provider
 * tile without conflating their credentials or model catalogs.
 */
export function applyCursorSdkProbe(
  cliStatus: AgentStatus,
  probe: CursorSdkRuntimeProbe,
  selectedRuntime: CursorStructuredRuntime = "sdk",
): AgentStatus {
  const cliInstalled = cliStatus.installed;
  const sdkReady = probe.installed && probe.authState === "authenticated";
  const sdkModels = probe.models;
  const sdkGui = cursorSdkGuiCapabilities(sdkModels);
  const acpCapabilities = cursorAcpRuntimeCapabilities(cliStatus.capabilities);
  const sdkCapabilities = cursorSdkRuntimeCapabilities(
    cliStatus.capabilities,
    sdkGui,
    cliInstalled,
  );
  const runtimeVariants: NonNullable<AgentStatus["runtimeVariants"]> = {
    acp: {
      presentationMode: "gui",
      installed: cliInstalled,
      ...(cliStatus.version ? { version: cliStatus.version } : {}),
      authState: authStateForPresentation(cliStatus, "gui"),
      authUsesProviderLogin: true,
      capabilities: acpCapabilities,
    },
    sdk: {
      presentationMode: "gui",
      installed: probe.installed,
      ...(probe.version ? { version: probe.version } : {}),
      ...(probe.source ? { installationSource: probe.source } : {}),
      authState: probe.authState,
      authUsesProviderLogin: false,
      capabilities: sdkCapabilities,
      ...(probe.authenticatedAs
        ? { providerMetadata: { authenticatedAs: probe.authenticatedAs } }
        : {}),
    },
  };
  const runtimeRouting: NonNullable<AgentStatus["sessionRuntimeRouting"]> = {
    prefixes: { [CURSOR_SDK_SESSION_PREFIX]: "sdk" },
    fallbackRuntime: "acp",
  };

  if ((selectedRuntime === "acp" && cliInstalled) || (!sdkReady && cliInstalled)) {
    const { presentationCapabilities: _presentationCapabilities, ...acpRootCapabilities } =
      cliStatus.capabilities;
    return {
      ...cliStatus,
      capabilities: {
        ...acpRootCapabilities,
        mcpScope: {
          ...acpRootCapabilities.mcpScope,
          gui: "launch",
        },
        presentationCapabilities: {
          gui: acpCapabilities,
        },
      },
      runtimeVariants,
      sessionRuntimeRouting: runtimeRouting,
    };
  }

  const { presentationCapabilities: _cliPresentationCapabilities, ...cliCapabilities } =
    cliStatus.capabilities;
  const capabilities: AgentStatus["capabilities"] = cliInstalled
    ? {
        ...cliCapabilities,
        presentationModes: sdkReady ? ["terminal", "gui"] : ["terminal"],
        mcpScope: {
          ...cliStatus.capabilities.mcpScope,
          ...(sdkReady ? { gui: "always" as const } : {}),
        },
        ...(sdkReady
          ? {
              presentationCapabilities: {
                gui: sdkGui,
              },
            }
          : {}),
      }
    : {
        ...cliCapabilities,
        ...sdkGui,
        presentationMode: "gui",
        presentationModes: sdkReady ? ["gui"] : [],
        supportsOneShot: false,
        mcpScope: sdkReady ? ({ gui: "always" } as const) : {},
        ...(sdkReady ? { presentationCapabilities: { gui: sdkGui } } : {}),
      };

  const presentationAuthStates = {
    ...(cliInstalled ? { terminal: cliStatus.authState } : {}),
    ...(probe.installed ? { gui: probe.authState } : {}),
  };
  const merged: AgentStatus = {
    ...cliStatus,
    installed: cliInstalled || probe.installed,
    authState: cliInstalled ? cliStatus.authState : probe.authState,
    capabilities,
    ...(cliInstalled
      ? {}
      : {
          ...(probe.version ? { version: probe.version } : {}),
        }),
    ...(Object.keys(presentationAuthStates).length > 0 ? { presentationAuthStates } : {}),
    ...(probe.installed ? { presentationAuthUsesProviderLogin: { gui: false } } : {}),
    runtimeVariants,
    sessionRuntimeRouting: runtimeRouting,
  };

  if (cliInstalled) return merged;
  const {
    loginCommand: _loginCommand,
    authMethods: _authMethods,
    authLogoutSupported: _authLogoutSupported,
    preferTerminalLogin: _preferTerminalLogin,
    update: _update,
    executablePath: _executablePath,
    ...sdkOnly
  } = merged;
  return sdkOnly;
}

function withoutPresentationCapabilities(capabilities: AgentCapability): AgentCapability {
  const { presentationCapabilities: _presentationCapabilities, ...effective } = capabilities;
  return effective;
}

function cursorAcpRuntimeCapabilities(capabilities: AgentCapability): AgentCapability {
  const effective = withoutPresentationCapabilities(
    capabilitiesForPresentation(capabilities, "gui"),
  );
  return {
    ...effective,
    runtimeLabel: "ACP",
    liveInputMode: "server",
    presentationMode: "gui",
    mcpScope: {
      ...effective.mcpScope,
      gui: "launch",
    },
  };
}

function cursorSdkRuntimeCapabilities(
  capabilities: AgentCapability,
  sdkGui: Partial<AgentCapability>,
  cliInstalled: boolean,
): AgentCapability {
  const { presentationCapabilities: _presentationCapabilities, ...base } = capabilities;
  const effective = withoutPresentationCapabilities(
    capabilitiesForPresentation(
      {
        ...base,
        mcpScope: {
          ...base.mcpScope,
          gui: "always",
        },
        presentationCapabilities: { gui: sdkGui },
      },
      "gui",
    ),
  );
  return {
    ...effective,
    supportsOneShot: cliInstalled ? effective.supportsOneShot : false,
  };
}

/**
 * Probe the external SDK from the environment where it will actually run.
 *
 * This is intentionally worker-backed even on the native host: importing the
 * SDK into the supervisor would run its local agent loop in the app process,
 * and importing a Linux optional package from Windows is impossible for WSL.
 */
export async function probeCursorSdkRuntime(
  ctx: AgentEnvContext | undefined,
  dependencies: CursorSdkDetectionDependencies = {},
  explicitApiKey?: string,
): Promise<CursorSdkRuntimeProbe> {
  const projectLocation = detectProbeLocation(ctx);
  // Read once, before the probe: the same record both steers discovery inside
  // the worker and backs the reported state if the probe never reaches one.
  // The record describes this host's native environment only — a root valid
  // here says nothing about a WSL distro and vice versa, and detection probes
  // both in one process. WSL workers resolve inside their own login shell, so
  // those probes never read, record, or drop the shared record.
  const pinsApply = projectLocation.kind !== "wsl";
  const recordedInstall = pinsApply ? readCursorSdkInstallPin() : undefined;
  const configuredApiKey =
    explicitApiKey?.trim() ||
    (typeof ctx?.agentSettings?.sdkApiKey === "string" ? ctx.agentSettings.sdkApiKey.trim() : "");
  let worker:
    | (Pick<CursorSdkWorkerClient, "probe" | "dispose"> &
        Partial<Pick<CursorSdkWorkerClient, "terminate">>)
    | undefined;
  const abortProbe = () => worker?.terminate?.();
  ctx?.signal?.addEventListener("abort", abortProbe, { once: true });
  try {
    ctx?.signal?.throwIfAborted();
    // Mock-QA enforcement: the worker runs the real Cursor SDK (account and
    // model-catalog requests), so mock sessions refuse it; the probe reports
    // an unavailable runtime like any other worker boot failure.
    assertAgentLaunchAllowed("session-probe");
    worker = await (dependencies.spawnWorker ?? spawnCursorSdkWorker)({
      projectLocation,
      ...(recordedInstall ? { pinnedRoot: recordedInstall } : {}),
    });
    ctx?.signal?.throwIfAborted();
    const result = await worker.probe(configuredApiKey || undefined);
    // Recording where this resolved to is what stops the next detection pass
    // from having to re-derive the location from this process' PATH. Only the
    // PATH-dependent sources are recorded: anything re-derivable for free
    // would just freeze a stale copy ahead of fresher installs. A WSL probe
    // never records — its root is not a path this host can use.
    if (pinsApply && result.packageRoot && shouldRecordCursorSdkInstall(result.source)) {
      recordCursorSdkInstallPin({
        packageRoot: result.packageRoot,
        source: result.source,
        version: result.sdkVersion,
      });
    }
    return {
      installed: true,
      authState: "authenticated",
      models: result.models,
      version: result.sdkVersion,
      source: result.source,
      ...(result.authenticatedAs ? { authenticatedAs: result.authenticatedAs } : {}),
    };
  } catch (error) {
    const code = cursorSdkProbeErrorCode(error);
    const normalizedCode = code?.toLowerCase();
    if (normalizedCode === "package_missing" && pinsApply) forgetCursorSdkInstallPin();
    if (normalizedCode && NOT_INSTALLED_CODES.has(normalizedCode)) {
      return {
        installed: false,
        authState: "unknown",
        models: [],
        ...(code ? { diagnosticCode: code } : {}),
        diagnosticMessage: cursorSdkProbeErrorMessage(error),
      };
    }
    // No verdict was reached about the package: the helper never booted, the
    // host environment was rejected, or an account request failed. None of that
    // says the installation is gone, so a recorded one keeps reporting as
    // installed instead of erasing an install the user can still use. An auth
    // failure is still an auth failure, and keeps its own auth state.
    if (recordedInstall) {
      return {
        installed: true,
        authState: normalizedCode && MISSING_AUTH_CODES.has(normalizedCode) ? "missing" : "unknown",
        models: [],
        version: recordedInstall.version,
        source: recordedInstall.source,
        ...(code ? { diagnosticCode: code } : {}),
        diagnosticMessage: cursorSdkProbeErrorMessage(error),
      };
    }
    return {
      // Once the helper booted, an unclassified failure is normally the
      // account catalog request (network/service), not package discovery.
      // Loader failures have stable codes and are classified above.
      installed: normalizedCode ? !NOT_INSTALLED_CODES.has(normalizedCode) : worker !== undefined,
      authState: normalizedCode && MISSING_AUTH_CODES.has(normalizedCode) ? "missing" : "unknown",
      models: [],
      ...(code ? { diagnosticCode: code } : {}),
      diagnosticMessage: cursorSdkProbeErrorMessage(error),
    };
  } finally {
    ctx?.signal?.removeEventListener("abort", abortProbe);
    await worker?.dispose().catch(() => undefined);
  }
}

function cursorSdkProbeErrorCode(error: unknown): string | undefined {
  if (error instanceof CursorSdkWorkerRpcError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") return String(code);
  }
  return undefined;
}

function cursorSdkProbeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The Cursor SDK runtime probe failed.";
}
