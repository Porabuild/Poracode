import { msg } from "@lingui/core/macro";
import type { AgentStatus, Project } from "@/shared/contracts";
import type { NativeAgentRuntimeSlots } from "./nativeAgentRuntimes";

export type CursorInstallRuntime = "acp" | "sdk" | "both";

export interface CursorRuntimeInstallState {
  acpInstalled: boolean;
  sdkInstalled: boolean;
  acpVersion?: string;
  sdkVersion?: string;
  sdkInstallationSource?: string;
}

export function cursorRuntimeInstallState(
  status: AgentStatus | undefined,
): CursorRuntimeInstallState {
  const variants = status?.runtimeVariants;
  const acpVersion =
    variants?.acp?.version ?? (variants?.acp?.installed ? status?.version : undefined);
  const sdkVersion =
    variants?.sdk?.version ?? (!variants?.acp?.installed ? status?.version : undefined);
  return {
    // Older cached Cursor statuses predate runtimeVariants and always represent
    // the installed Cursor Agent, so preserve that as the ACP fallback.
    acpInstalled: variants?.acp?.installed ?? status?.installed ?? false,
    sdkInstalled: variants?.sdk?.installed ?? false,
    ...(acpVersion ? { acpVersion } : {}),
    ...(sdkVersion ? { sdkVersion } : {}),
    ...(variants?.sdk?.installationSource
      ? { sdkInstallationSource: variants.sdk.installationSource }
      : {}),
  };
}

/**
 * Cursor install/update commands branch on the *project* location rather than
 * the detected host platform (the registry's `posixOrWindows` helper): a remote
 * client's advertised platform can fall back to the client UA before pairing
 * completes, while `location.kind` always describes the shell the command will
 * actually run in.
 */
function isWindowsProject(project: Project): boolean {
  return project.location.kind === "windows";
}

/** `if <tool> exists then <body> else explain` in the project's shell dialect. */
function guardedCommand(
  project: Project,
  tool: string,
  body: string,
  missingMessage: string,
): string {
  return isWindowsProject(project)
    ? `if (Get-Command ${tool} -ErrorAction SilentlyContinue) { ${body} } else { Write-Host '${missingMessage}' }`
    : `if command -v ${tool} >/dev/null 2>&1; then ${body}; else printf '${missingMessage}\\n'; fi`;
}

/** Supported `@cursor/sdk` range — see sdkLoader's compatibility check. */
const CURSOR_SDK_PACKAGE_SPEC = "'@cursor/sdk@^1.0.24'";
const MISSING_CURL_MESSAGE =
  "curl is required to install Cursor. Install curl, then refresh detected agents.";
const MISSING_WINDOWS_INSTALLER_MESSAGE =
  "No supported installer found. Install PowerShell Invoke-RestMethod first, then refresh detected agents.";
const MISSING_NPM_MESSAGE =
  "npm is required to install the Cursor SDK. Install Node.js/npm first, then refresh detected agents.";
const MISSING_PNPM_MESSAGE = "pnpm is required to update this Cursor SDK installation.";

export function cursorAgentInstallCommand(project: Project): string {
  return isWindowsProject(project)
    ? guardedCommand(
        project,
        "irm",
        "irm 'https://cursor.com/install?win32=true' | iex",
        MISSING_WINDOWS_INSTALLER_MESSAGE,
      )
    : guardedCommand(
        project,
        "curl",
        "curl https://cursor.com/install -fsS | bash",
        MISSING_CURL_MESSAGE,
      );
}

export function cursorSdkInstallCommand(project: Project): string {
  return guardedCommand(
    project,
    "npm",
    `npm install -g ${CURSOR_SDK_PACKAGE_SPEC}`,
    MISSING_NPM_MESSAGE,
  );
}

export function cursorSdkUpdateCommand(status: AgentStatus, project: Project): string | undefined {
  const source = cursorRuntimeInstallState(status).sdkInstallationSource;
  if (source === "global-pnpm") {
    return guardedCommand(
      project,
      "pnpm",
      `pnpm add -g ${CURSOR_SDK_PACKAGE_SPEC}`,
      MISSING_PNPM_MESSAGE,
    );
  }
  if (source !== "global-npm") return undefined;
  return cursorSdkInstallCommand(project);
}

export function canUpdateCursorSdk(status: AgentStatus): boolean {
  const source = cursorRuntimeInstallState(status).sdkInstallationSource;
  return source === "global-npm" || source === "global-pnpm";
}

export function cursorRuntimeInstallCommand(
  runtime: CursorInstallRuntime,
  project: Project,
): string {
  if (runtime === "acp") return cursorAgentInstallCommand(project);
  if (runtime === "sdk") return cursorSdkInstallCommand(project);

  const acp = cursorAgentInstallCommand(project);
  const sdk = cursorSdkInstallCommand(project);
  return isWindowsProject(project) ? `${acp}; if ($?) { ${sdk} }` : `( ${acp} ) && ( ${sdk} )`;
}

/** Cursor's install-source vocabulary; only Cursor knows what these mean. */
function cursorSdkSourceLabel(source: string) {
  if (source === "global-npm") return msg`global npm`;
  if (source === "global-pnpm") return msg`global pnpm`;
  if (source === "project") return msg`project managed`;
  if (source === "configured") return msg`custom path`;
  if (source === "node-path") return "NODE_PATH";
  if (source === "global-explicit" || source === "global-inferred") return msg`global`;
  return undefined;
}

/**
 * Cursor ships two independently installed runtimes behind one provider tile:
 * the Cursor Agent CLI (ACP) and the public `@cursor/sdk` package. The shared
 * registry card renders both from this declaration.
 */
export const cursorRuntimeSlots: NativeAgentRuntimeSlots = {
  runtimes: [
    {
      id: "acp",
      badge: "ACP",
      installedTag: msg`ACP installed`,
      notInstalledTag: msg`ACP not installed`,
      installLabel: (environment) =>
        environment
          ? msg`Install Cursor Agent (ACP) in ${environment}`
          : msg`Install Cursor Agent (ACP)`,
      installCommand: (project) => cursorRuntimeInstallCommand("acp", project),
      detect: (status) => {
        const state = cursorRuntimeInstallState(status);
        return {
          installed: state.acpInstalled,
          ...(state.acpVersion ? { version: state.acpVersion } : {}),
        };
      },
    },
    {
      id: "sdk",
      badge: "SDK",
      installedTag: msg`SDK installed`,
      notInstalledTag: msg`SDK not installed`,
      installLabel: (environment) =>
        environment ? msg`Install Cursor SDK in ${environment}` : msg`Install Cursor SDK`,
      installCommand: (project) => cursorRuntimeInstallCommand("sdk", project),
      detect: (status) => {
        const state = cursorRuntimeInstallState(status);
        return {
          installed: state.sdkInstalled,
          ...(state.sdkVersion ? { version: state.sdkVersion } : {}),
          ...(state.sdkInstallationSource
            ? { installationSource: state.sdkInstallationSource }
            : {}),
        };
      },
      sourceLabel: cursorSdkSourceLabel,
      update: {
        actionLabel: (environment) =>
          environment ? msg`Update Cursor SDK in ${environment}` : msg`Update Cursor SDK`,
        buttonLabel: msg`Update SDK`,
        menuLabel: msg`Cursor SDK update targets`,
        updatedToast: (nextVersion) => msg`Cursor SDK updated to v${nextVersion}.`,
        upToDateToast: msg`Cursor SDK is up to date.`,
        canUpdate: canUpdateCursorSdk,
        command: cursorSdkUpdateCommand,
      },
    },
  ],
  bundle: {
    id: "both",
    installLabel: (environment) =>
      environment ? msg`Install ACP + SDK in ${environment}` : msg`Install ACP + SDK`,
    installCommand: (project) => cursorRuntimeInstallCommand("both", project),
  },
};
