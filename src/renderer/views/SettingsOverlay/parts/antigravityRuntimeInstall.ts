import { msg } from "@lingui/core/macro";
import { ANTIGRAVITY_ACP_REGISTRY_ID } from "@/shared/agents/antigravity";
import type { Project } from "@/shared/contracts";
import { isWindows } from "@/renderer/bridge";
import type { NativeAgentRuntimeSlots } from "./nativeAgentRuntimes";

export function antigravityCliInstallCommand(project: Project): string {
  if (project.location.kind === "wsl" || !isWindows()) {
    return 'if command -v curl >/dev/null 2>&1; then antigravity_installer=$(mktemp) && curl -fsSL https://antigravity.google/cli/install.sh -o "$antigravity_installer" && bash "$antigravity_installer"; antigravity_install_status=$?; if [ -n "${antigravity_installer:-}" ]; then rm -f "$antigravity_installer"; fi; test "$antigravity_install_status" -eq 0; else printf \'curl is required to install Antigravity. Install curl, then refresh detected agents.\\n\' >&2; false; fi';
  }
  return "if (Get-Command irm -ErrorAction SilentlyContinue) { try { irm https://antigravity.google/cli/install.ps1 | iex; cmd /c exit 0 } catch { Write-Error $_; cmd /c exit 1 } } elseif (Get-Command curl.exe -ErrorAction SilentlyContinue) { cmd /c \"curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd\" } else { Write-Error 'No supported installer found. Install PowerShell Invoke-RestMethod or curl first, then refresh detected agents.'; cmd /c exit 1 }";
}

export const antigravityRuntimeSlots: NativeAgentRuntimeSlots = {
  unifiedAgent: true,
  runtimes: [
    {
      id: "cli",
      badge: "CLI",
      installedTag: msg`Installed`,
      notInstalledTag: msg`Not installed`,
      installLabel: (environment) =>
        environment ? msg`Install Antigravity in ${environment}` : msg`Install Antigravity`,
      installCommand: antigravityCliInstallCommand,
    },
    {
      id: "acp",
      badge: "ACP",
      installedTag: msg`ACP installed`,
      notInstalledTag: msg`ACP not installed`,
      installLabel: (environment) =>
        environment ? msg`Install Antigravity in ${environment}` : msg`Install Antigravity`,
      registryAgentId: ANTIGRAVITY_ACP_REGISTRY_ID,
    },
  ],
  bundle: {
    id: "both",
    installLabel: (environment) =>
      environment ? msg`Install Antigravity in ${environment}` : msg`Install Antigravity`,
    installCommand: antigravityCliInstallCommand,
    commandRuntimeId: "cli",
    registryAgentId: ANTIGRAVITY_ACP_REGISTRY_ID,
  },
};
