import { CURSOR_SDK_INSTALL_SPEC } from "@/shared/agents/cursorSdkPackage";
import type { AgentStatus, Project } from "@/shared/contracts";

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

/** Shell-quoted install spec; the range itself lives in `cursorSdkPackage.ts`. */
const CURSOR_SDK_PACKAGE_SPEC = `'${CURSOR_SDK_INSTALL_SPEC}'`;
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

/**
 * Global installs the SDK discovery can report. `global-npm` / `global-pnpm`
 * only come from the deferred `npm root -g` / `pnpm root -g` probe, which never
 * runs once a filesystem candidate already matched — a Node prefix of its own
 * (~/.local, nvm, fnm, volta, Homebrew) resolves as `global-inferred` instead.
 * Treating only the probe sources as updatable left the update action dead for
 * those installs, so the button fell through to the agent updater and refreshed
 * the CLI while the SDK stayed on its old version.
 */
const NPM_UPDATABLE_SDK_SOURCES = new Set(["global-npm", "global-explicit", "global-inferred"]);

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
  if (!source || !NPM_UPDATABLE_SDK_SOURCES.has(source)) return undefined;
  return cursorSdkInstallCommand(project);
}

export function canUpdateCursorSdk(status: AgentStatus): boolean {
  const source = cursorRuntimeInstallState(status).sdkInstallationSource;
  return source === "global-pnpm" || (!!source && NPM_UPDATABLE_SDK_SOURCES.has(source));
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
