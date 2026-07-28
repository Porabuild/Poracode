import { authStateForPresentation, capabilitiesForPresentation } from "@/shared/agentSelection";
import type { AgentCapability, AgentStatus, AuthState } from "@/shared/contracts";
import { detectProbeLocation, type AgentEnvContext } from "../base";
import { cursorSdkGuiCapabilities, type CursorSdkModel } from "./sdkModels";
import {
  CURSOR_SDK_SESSION_PREFIX,
  cursorSdkConfiguredPath,
  type CursorStructuredRuntime,
} from "./structuredRuntime";
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
  /**
   * The environment-wide probe cannot see project-local node_modules or
   * project-shell credentials because it deliberately runs from home (native)
   * or /tmp (WSL). When package or credential discovery may therefore differ
   * at launch, keep the explicitly-selected SDK runtime selectable and let the
   * session resolve it from the real project cwd. Invalid configured paths and
   * credentials that were actually presented and rejected remain exact
   * failures.
   */
  projectDiscoveryDeferred?: boolean;
  version?: string;
  source?: string;
  diagnosticCode?: string;
  diagnosticMessage?: string;
}

export interface CursorSdkDetectionDependencies {
  spawnWorker?(
    options: CursorSdkWorkerSpawnOptions,
  ): Promise<Pick<CursorSdkWorkerClient, "probe" | "dispose">>;
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
  const sdkSelectable = probe.installed || probe.projectDiscoveryDeferred === true;
  const sdkModels =
    probe.models.length > 0
      ? probe.models
      : probe.projectDiscoveryDeferred
        ? deferredProjectSdkModels(cliStatus)
        : [];
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
      installed: sdkSelectable,
      ...(probe.version ? { version: probe.version } : {}),
      ...(probe.source ? { installationSource: probe.source } : {}),
      authState: probe.authState,
      authUsesProviderLogin: false,
      capabilities: sdkCapabilities,
    },
  };
  const runtimeRouting: NonNullable<AgentStatus["sessionRuntimeRouting"]> = {
    prefixes: { [CURSOR_SDK_SESSION_PREFIX]: "sdk" },
    fallbackRuntime: "acp",
  };

  if (selectedRuntime === "acp") {
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
        presentationModes: sdkSelectable ? ["terminal", "gui"] : ["terminal"],
        mcpScope: {
          ...cliStatus.capabilities.mcpScope,
          ...(sdkSelectable ? { gui: "always" as const } : {}),
        },
        ...(sdkSelectable
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
        presentationModes: sdkSelectable ? ["gui"] : [],
        supportsOneShot: false,
        mcpScope: sdkSelectable ? ({ gui: "always" } as const) : {},
        ...(sdkSelectable ? { presentationCapabilities: { gui: sdkGui } } : {}),
      };

  const presentationAuthStates = {
    ...(cliInstalled ? { terminal: cliStatus.authState } : {}),
    ...(sdkSelectable ? { gui: probe.authState } : {}),
  };
  const merged: AgentStatus = {
    ...cliStatus,
    installed: cliInstalled || sdkSelectable,
    authState: cliInstalled ? cliStatus.authState : probe.authState,
    capabilities,
    ...(cliInstalled
      ? {}
      : {
          ...(probe.version ? { version: probe.version } : {}),
        }),
    ...(Object.keys(presentationAuthStates).length > 0 ? { presentationAuthStates } : {}),
    ...(sdkSelectable ? { presentationAuthUsesProviderLogin: { gui: false } } : {}),
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
 * Supply a launchable model choice while project-local SDK discovery is
 * deferred. Cursor CLI and SDK model ids share the provider catalog. Preserve
 * `auto` as the documented server-selected SDK fallback; `auto-smart` is the
 * separately gated Cursor Router and must never be invented for an account
 * whose catalog could not be read. The real catalog is fetched before
 * Agent.create/resume and supplies any supported parameters.
 */
function deferredProjectSdkModels(cliStatus: AgentStatus): CursorSdkModel[] {
  const models = cliStatus.capabilities.models.map((model) => ({
    id: model.id,
    displayName: model.label,
  }));
  return models.length > 0 ? models : [{ id: "auto", displayName: "Auto" }];
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
): Promise<CursorSdkRuntimeProbe> {
  const projectLocation = detectProbeLocation(ctx);
  const configuredPath = cursorSdkConfiguredPath(ctx?.agentSettings, projectLocation);
  let worker: Pick<CursorSdkWorkerClient, "probe" | "dispose"> | undefined;
  try {
    worker = await (dependencies.spawnWorker ?? spawnCursorSdkWorker)({
      projectLocation,
      ...(configuredPath ? { configuredPath } : {}),
    });
    const result = await worker.probe();
    return {
      installed: true,
      authState: "authenticated",
      models: result.models,
      version: result.sdkVersion,
      source: result.source,
    };
  } catch (error) {
    const code = cursorSdkProbeErrorCode(error);
    const normalizedCode = code?.toLowerCase();
    const projectDiscoveryDeferred =
      (normalizedCode === "package_missing" && configuredPath === undefined) ||
      normalizedCode === "auth_missing";
    return {
      // Once the helper booted, an unclassified failure is normally the
      // account catalog request (network/service), not package discovery.
      // Loader failures have stable codes and are classified above.
      installed: normalizedCode ? !NOT_INSTALLED_CODES.has(normalizedCode) : worker !== undefined,
      authState:
        normalizedCode && MISSING_AUTH_CODES.has(normalizedCode) && !projectDiscoveryDeferred
          ? "missing"
          : "unknown",
      models: [],
      ...(projectDiscoveryDeferred ? { projectDiscoveryDeferred: true } : {}),
      ...(code ? { diagnosticCode: code } : {}),
      diagnosticMessage: cursorSdkProbeErrorMessage(error),
    };
  } finally {
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
