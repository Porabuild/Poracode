import type { AgentCapability, AgentInstanceConfig, AgentStatus } from "@/shared/contracts";
import { capabilitiesForPresentation } from "@/shared/agentSelection";
import { resolveUnrestrictedPermissionConfig } from "@/shared/agents/unrestrictedPermissions";
import { createAcpGenericAdapter } from "../acp-generic";
import type { AgentAdapter } from "../base";
import { buildAntigravityAcpModelCapabilities } from "./models";

const ANTIGRAVITY_ACP_PROBE_TIMEOUT_MS = 60_000;

export function createAntigravityAcpRuntime(
  instance: AgentInstanceConfig | undefined,
): AgentAdapter | undefined {
  if (!instance) return undefined;
  return createAcpGenericAdapter(instance, {
    kind: "antigravity",
    label: "Antigravity",
    probeTimeoutMs: ANTIGRAVITY_ACP_PROBE_TIMEOUT_MS,
    normalizeProbeResult: (result) => {
      if (!result.models?.length) return result;
      const normalized = buildAntigravityAcpModelCapabilities(result.models);
      return {
        ...result,
        models: normalized.models.map((model) => ({
          id: model.id,
          label: model.label,
          ...(model.description ? { description: model.description } : {}),
          ...(model.tooltipDescription ? { tooltipDescription: model.tooltipDescription } : {}),
        })),
        efforts: normalized.efforts,
        modelEfforts: normalized.modelEfforts,
        ...(normalized.defaultEffort ? { defaultEffort: normalized.defaultEffort } : {}),
      };
    },
    // Only modes actually advertised by Google's server belong in the picker.
    synthesizeApprovalPolicies: false,
  });
}

function terminalRuntimeCapabilities(capabilities: AgentCapability): AgentCapability {
  const { presentationCapabilities: _presentationCapabilities, ...base } = capabilities;
  return {
    ...base,
    runtimeLabel: "CLI",
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal"],
    mcpScope: { terminal: "none" },
  };
}

/**
 * Chat's permission modes come from Google's server (`Default` / `Auto Edit` /
 * `YOLO`), and their ids are not the CLI's — ACP's `yolo` maps to `never`,
 * where `agy` names the same posture `yolo`. The root status keeps the CLI's
 * capabilities, and `capabilitiesForPresentation` only overwrites the keys the
 * GUI override actually declares, so without declaring these two the CLI's
 * `yolo` default leaks onto a surface that never advertised it — the composer
 * then renders the raw id and drafts open with no valid selection.
 */
function acpApprovalDefaults(
  policies: AgentCapability["approvalPolicies"],
): Pick<AgentCapability, "defaultApprovalPolicy" | "bypassPermissions"> {
  // Empty means the GUI inherits the root's policy list, so its default and
  // bypass posture must be inherited with it.
  if (policies.length === 0) return {};
  const bypass = resolveUnrestrictedPermissionConfig({
    approvalPolicies: policies,
    sandboxModes: [],
  }).approvalPolicy;
  return {
    defaultApprovalPolicy: bypass ?? policies[0]!.id,
    ...(bypass ? { bypassPermissions: { approvalPolicy: bypass } } : {}),
  };
}

function acpRuntimeCapabilities(capabilities: AgentCapability): AgentCapability {
  const { presentationCapabilities: _presentationCapabilities, ...base } =
    capabilitiesForPresentation(capabilities, "gui");
  return {
    ...base,
    ...acpApprovalDefaults(base.approvalPolicies),
    // Antigravity has one Chat runtime. Keep its picker identity canonical
    // ("Antigravity") instead of exposing the transport detail as a suffix.
    runtimeLabel: "ACP",
    showRuntimeLabelInPicker: false,
    supportsOneShot: false,
    liveInputMode: "server",
    presentationMode: "gui",
    presentationModes: ["gui"],
    mcpScope: { ...base.mcpScope, gui: "launch" },
  };
}

export function applyAntigravityAcpStatus(
  cliStatus: AgentStatus,
  acpStatus: AgentStatus | undefined,
): AgentStatus {
  const cliInstalled = cliStatus.installed;
  const acpInstalled = acpStatus?.installed === true;
  const terminalCapabilities = terminalRuntimeCapabilities(cliStatus.capabilities);
  const guiCapabilities = acpRuntimeCapabilities(
    acpStatus?.capabilities ?? {
      ...cliStatus.capabilities,
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: false,
      supportsOneShot: false,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      settingDefs: [],
    },
  );
  const {
    loginCommand: _cliLoginCommand,
    preferTerminalLogin: _cliPreferTerminalLogin,
    authMethods: _cliAuthMethods,
    authLogoutSupported: _cliAuthLogoutSupported,
    acpSessionEstablished: _cliSessionEstablished,
    providerMetadata: _cliProviderMetadata,
    ...cliBaseStatus
  } = cliStatus;
  const rootCapabilities: AgentCapability = cliInstalled
    ? {
        ...cliStatus.capabilities,
        presentationModes: acpInstalled ? ["terminal", "gui"] : ["terminal"],
        mcpScope: {
          ...cliStatus.capabilities.mcpScope,
          ...(acpInstalled ? { gui: "launch" as const } : {}),
        },
        ...(acpInstalled ? { presentationCapabilities: { gui: guiCapabilities } } : {}),
      }
    : {
        ...guiCapabilities,
        presentationModes: acpInstalled ? ["gui"] : [],
        ...(acpInstalled ? { presentationCapabilities: { gui: guiCapabilities } } : {}),
      };
  // Supervisor consumers gate on the root `authState`, and the supervisor's
  // child lane runs through the CLI one-shot — so while the CLI is installed
  // the root state is the CLI's, and an installed-but-not-signed-in chat
  // artifact cannot demote a signed-in CLI to "missing". Per-surface truth
  // lives in `presentationAuthStates`/`runtimeVariants`; the root login fields
  // below keep preferring the chat runtime.
  const rootAuthState = cliInstalled ? cliStatus.authState : (acpStatus?.authState ?? "missing");
  const preferredStatus = acpInstalled ? acpStatus : cliStatus;
  const merged: AgentStatus = {
    ...cliBaseStatus,
    installed: cliInstalled || acpInstalled,
    authState: rootAuthState,
    capabilities: rootCapabilities,
    presentationAuthStates: {
      ...(cliInstalled ? { terminal: cliStatus.authState } : {}),
      ...(acpInstalled && acpStatus ? { gui: acpStatus.authState } : {}),
    },
    presentationAuthUsesProviderLogin: {
      ...(cliInstalled ? { terminal: true } : {}),
      ...(acpInstalled ? { gui: true } : {}),
    },
    runtimeVariants: {
      cli: {
        presentationMode: "terminal",
        installed: cliInstalled,
        ...(cliStatus.version ? { version: cliStatus.version } : {}),
        authState: cliStatus.authState,
        authUsesProviderLogin: true,
        ...(cliStatus.loginCommand ? { loginCommand: cliStatus.loginCommand } : {}),
        ...(cliStatus.preferTerminalLogin !== undefined
          ? { preferTerminalLogin: cliStatus.preferTerminalLogin }
          : {}),
        ...(cliStatus.authMethods ? { authMethods: cliStatus.authMethods } : {}),
        ...(cliStatus.authLogoutSupported ? { authLogoutSupported: true } : {}),
        ...(cliStatus.providerMetadata ? { providerMetadata: cliStatus.providerMetadata } : {}),
        capabilities: terminalCapabilities,
      },
      acp: {
        presentationMode: "gui",
        installed: acpInstalled,
        ...(acpStatus?.version ? { version: acpStatus.version } : {}),
        authState: acpStatus?.authState ?? "missing",
        authUsesProviderLogin: true,
        ...(acpStatus?.loginCommand ? { loginCommand: acpStatus.loginCommand } : {}),
        ...(acpStatus?.preferTerminalLogin !== undefined
          ? { preferTerminalLogin: acpStatus.preferTerminalLogin }
          : {}),
        ...(acpStatus?.authMethods ? { authMethods: acpStatus.authMethods } : {}),
        ...(acpStatus?.authLogoutSupported ? { authLogoutSupported: true } : {}),
        ...(acpStatus?.providerMetadata ? { providerMetadata: acpStatus.providerMetadata } : {}),
        capabilities: guiCapabilities,
      },
    },
    ...(preferredStatus?.loginCommand ? { loginCommand: preferredStatus.loginCommand } : {}),
    ...(preferredStatus?.preferTerminalLogin !== undefined
      ? { preferTerminalLogin: preferredStatus.preferTerminalLogin }
      : {}),
    ...(preferredStatus?.authMethods ? { authMethods: preferredStatus.authMethods } : {}),
    ...(preferredStatus?.authLogoutSupported ? { authLogoutSupported: true } : {}),
    ...(preferredStatus?.acpSessionEstablished ? { acpSessionEstablished: true } : {}),
    ...(preferredStatus?.providerMetadata
      ? { providerMetadata: preferredStatus.providerMetadata }
      : {}),
  };

  if (cliInstalled) return merged;
  const {
    executablePath: _executablePath,
    update: _update,
    loginCommand: _loginCommand,
    preferTerminalLogin: _preferTerminalLogin,
    ...acpOnly
  } = merged;
  return {
    ...acpOnly,
    ...(acpStatus?.executablePath ? { executablePath: acpStatus.executablePath } : {}),
    ...(acpStatus?.version ? { version: acpStatus.version } : {}),
    ...(acpStatus?.loginCommand ? { loginCommand: acpStatus.loginCommand } : {}),
  };
}
