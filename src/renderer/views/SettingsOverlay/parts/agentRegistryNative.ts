import type { ComponentType } from "react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { AgentKind, AgentProviderMetadata, AgentStatus, Project } from "@/shared/contracts";
import { isMac, isWindows, readBridge } from "@/renderer/bridge";
import { ClaudeAgentSettingsPanel } from "./ClaudeProfileSettings";
import { OpenCodeProviderSettings } from "./OpenCodeProviderSettings";

/**
 * Props handed to a provider's `settingsPanel`. Panels may consume any
 * subset; `SingleAgentSettings` supplies them all.
 */
export interface NativeAgentSettingsPanelProps {
  agentKind: string;
  statuses: readonly AgentStatus[];
  wslDistros: string[];
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}

export interface NativeAgentAcpRegistryAlias {
  id: string;
  /** The app can run this registry agent through its built-in native adapter. */
  nativeSupport?: boolean;
}

export interface NativeAgentRegistryEntry {
  id: AgentKind;
  description: MessageDescriptor;
  installCommand: (project: Project) => string;
  docsUrl: string;
  /**
   * ACP registry ids that belong to this built-in provider family. Registry
   * cards use these aliases to resolve native installs and hide redundant ACP
   * wrappers. `nativeSupport` marks aliases whose ACP implementation is driven
   * directly by the built-in adapter.
   */
  acpRegistryAliases?: readonly NativeAgentAcpRegistryAlias[];
  /**
   * Provider-specific settings UI rendered by `SingleAgentSettings` below the
   * environment rows. Matched by `baseAgentKind`, so instance-scoped kinds
   * (Claude profiles) render their base provider's panel.
   */
  settingsPanel?: ComponentType<NativeAgentSettingsPanelProps>;
  /**
   * The provider's `settingsPanel` owns sign-in UI, so `SingleAgentSettings`
   * suppresses its generic auth section (e.g. OpenCode authenticates per AI
   * provider — a generic single sign-in row would be redundant).
   */
  ownsAuthUi?: boolean;
  /**
   * Resolve the provider's signed-in account when it isn't part of the
   * detected status (e.g. Antigravity's credential sits in the OS keyring
   * behind its language server). Called when the agent's settings page opens;
   * resolving `undefined` hides the account line.
   */
  accountResolver?: (wslDistros: string[]) => Promise<AgentProviderMetadata | undefined>;
}

const POSIX_MISSING_CURL_NPM_MESSAGE =
  "printf 'No supported installer found. Install curl or Node.js/npm first, then refresh detected agents.\\n'";
const MAC_MISSING_CURL_BREW_NPM_MESSAGE =
  "printf 'No supported installer found. Install curl, Homebrew, or Node.js/npm first, then refresh detected agents.\\n'";
const MAC_MISSING_CURL_BREW_MESSAGE =
  "printf 'No supported installer found. Install curl or Homebrew first, then refresh detected agents.\\n'";
const POSIX_MISSING_CURL_MESSAGE =
  "printf 'curl is required to install this agent. Install curl, then refresh detected agents.\\n'";
const POSIX_MISSING_NPM_MESSAGE =
  "printf 'npm is required to install this agent. Install Node.js/npm first, then refresh detected agents.\\n'";

function isWslProject(project: Project): boolean {
  return project.location.kind === "wsl";
}

function posixOrWindows(project: Project, posix: string, windows: string): string {
  return isWslProject(project) || !isWindows() ? posix : windows;
}

function nativeInstallCommand(
  project: Project,
  commands: { mac: string; posix: string; windows: string },
): string {
  if (isWslProject(project)) return commands.posix;
  if (isWindows()) return commands.windows;
  return isMac() ? commands.mac : commands.posix;
}

export const NATIVE_AGENT_REGISTRY_ENTRIES: NativeAgentRegistryEntry[] = [
  {
    id: "codex",
    acpRegistryAliases: [{ id: "codex-acp" }],
    description: msg`First-class Codex CLI integration using Poracode's native app-server runtime.`,
    docsUrl: "https://developers.openai.com/codex/cli",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://chatgpt.com/codex/install.sh | sh; " +
          "elif command -v brew >/dev/null 2>&1; then brew install --cask codex; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @openai/codex; else " +
          MAC_MISSING_CURL_BREW_NPM_MESSAGE +
          "; fi",
        posix:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://chatgpt.com/codex/install.sh | sh; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @openai/codex; else " +
          POSIX_MISSING_CURL_NPM_MESSAGE +
          "; fi",
        windows:
          "if (Get-Command powershell -ErrorAction SilentlyContinue) { powershell -ExecutionPolicy ByPass -c \"irm https://chatgpt.com/codex/install.ps1 | iex\" } elseif (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g @openai/codex } else { Write-Host 'No supported installer found. Install Windows PowerShell or Node.js/npm first, then refresh detected agents.' }",
      }),
  },
  {
    id: "claude",
    acpRegistryAliases: [{ id: "claude-acp" }],
    description: msg`First-class Claude Code integration using Poracode's native SDK runtime.`,
    docsUrl: "https://code.claude.com/docs/en/setup",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://claude.ai/install.sh | bash; " +
          "elif command -v brew >/dev/null 2>&1; then brew install --cask claude-code; else " +
          MAC_MISSING_CURL_BREW_MESSAGE +
          "; fi",
        posix:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://claude.ai/install.sh | bash; else " +
          POSIX_MISSING_CURL_MESSAGE +
          "; fi",
        windows:
          "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://claude.ai/install.ps1 | iex } elseif (Get-Command curl.exe -ErrorAction SilentlyContinue) { cmd /c \"curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd\" } elseif (Get-Command winget -ErrorAction SilentlyContinue) { winget install Anthropic.ClaudeCode } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod, curl, or WinGet first, then refresh detected agents.' }",
      }),
    settingsPanel: ClaudeAgentSettingsPanel,
  },
  {
    id: "opencode",
    acpRegistryAliases: [{ id: "opencode" }],
    description: msg`First-class OpenCode integration using Poracode's native SDK runtime.`,
    docsUrl: "https://opencode.ai/docs/",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://opencode.ai/install | bash; " +
          "elif command -v brew >/dev/null 2>&1; then brew install anomalyco/tap/opencode; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g opencode-ai; else " +
          MAC_MISSING_CURL_BREW_NPM_MESSAGE +
          "; fi",
        posix:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://opencode.ai/install | bash; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g opencode-ai; else " +
          POSIX_MISSING_CURL_NPM_MESSAGE +
          "; fi",
        windows:
          "if (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g opencode-ai } else { Write-Host 'No supported installer found. Install Node.js/npm first, then refresh detected agents.' }",
      }),
    settingsPanel: OpenCodeProviderSettings,
    ownsAuthUi: true,
  },
  {
    id: "pi",
    acpRegistryAliases: [{ id: "pi-acp" }],
    description: msg`First-class Pi integration using a real terminal and Pi's native SDK runtime.`,
    docsUrl: "https://pi.dev/docs/latest",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://pi.dev/install.sh | sh; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @earendil-works/pi-coding-agent; else " +
          POSIX_MISSING_CURL_NPM_MESSAGE +
          "; fi",
        posix:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://pi.dev/install.sh | sh; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @earendil-works/pi-coding-agent; else " +
          POSIX_MISSING_CURL_NPM_MESSAGE +
          "; fi",
        windows:
          "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://pi.dev/install.ps1 | iex } elseif (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g @earendil-works/pi-coding-agent } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod or Node.js/npm first, then refresh detected agents.' }",
      }),
  },
  {
    id: "grok",
    acpRegistryAliases: [{ id: "grok-build" }],
    description: msg`First-class Grok Build CLI integration using Poracode's native runtime.`,
    docsUrl: "https://docs.x.ai/build/overview",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://x.ai/cli/install.sh | bash; " +
          "else printf 'curl is required to install Grok Build. Install curl, then refresh detected agents.\\n'; fi",
        posix:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://x.ai/cli/install.sh | bash; " +
          "else printf 'curl is required to install Grok Build. Install curl, then refresh detected agents.\\n'; fi",
        windows:
          "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://x.ai/cli/install.ps1 | iex } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod first, then refresh detected agents.' }",
      }),
  },
  {
    id: "kimi",
    description: msg`First-class Kimi Code CLI integration using Poracode's native runtime.`,
    docsUrl: "https://www.kimi.com/code/docs/en/",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash; " +
          "else printf 'curl is required to install Kimi Code. Install curl, then refresh detected agents.\\n'; fi",
        "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://code.kimi.com/kimi-code/install.ps1 | iex } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod first, then refresh detected agents.' }",
      ),
  },
  {
    id: "factory",
    acpRegistryAliases: [{ id: "factory-droid", nativeSupport: true }],
    description: msg`First-class Factory Droid integration using Poracode's ACP runtime.`,
    docsUrl: "https://docs.factory.ai/cli/getting-started/overview",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://app.factory.ai/cli | sh; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g droid; else " +
          POSIX_MISSING_CURL_NPM_MESSAGE +
          "; fi",
        "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://app.factory.ai/cli/windows | iex } elseif (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g droid } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod or Node.js/npm first, then refresh detected agents.' }",
      ),
  },
  {
    id: "antigravity",
    description: msg`First-class Antigravity CLI integration using Poracode's native runtime.`,
    docsUrl: "https://antigravity.google/docs/cli-getting-started",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://antigravity.google/cli/install.sh | bash; " +
          "else printf 'curl is required to install Antigravity. Install curl, then refresh detected agents.\\n'; fi",
        "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://antigravity.google/cli/install.ps1 | iex } elseif (Get-Command curl.exe -ErrorAction SilentlyContinue) { cmd /c \"curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd\" } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod or curl first, then refresh detected agents.' }",
      ),
    // Antigravity's signed-in account lives behind its language server (the
    // credential sits in the OS keyring), so it isn't in the detected status.
    accountResolver: (wslDistros) =>
      readBridge()
        .resolveAgentAccount({ agentKind: "antigravity", wslDistros })
        .then((result) => result.account),
  },
  {
    id: "commandcode",
    description: msg`First-class Command Code CLI integration using Poracode's native runtime.`,
    docsUrl: "https://commandcode.ai/docs/quickstart",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v npm >/dev/null 2>&1; then npm install -g command-code@latest; else " +
          "printf 'npm is required to install Command Code. Install Node.js/npm first, then refresh detected agents.\\n'; fi",
        posix:
          "if command -v npm >/dev/null 2>&1; then npm install -g command-code@latest && " +
          'prefix="$(npm config get prefix)" && mkdir -p "$HOME/.local/bin" && ' +
          'ln -sf "$prefix/bin/command-code" "$HOME/.local/bin/command-code"; else ' +
          "printf 'npm is required to install Command Code. Install Node.js/npm first, then refresh detected agents.\\n'; fi",
        windows:
          "if (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g command-code@latest } else { Write-Host 'No supported installer found. Install Node.js/npm first, then refresh detected agents.' }",
      }),
  },
  {
    id: "cursor",
    acpRegistryAliases: [{ id: "cursor", nativeSupport: true }],
    description: msg`First-class Cursor Agent integration using Poracode's native runtime.`,
    docsUrl: "https://cursor.com/docs/cli/installation",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl https://cursor.com/install -fsS | bash; " +
          "else printf 'curl is required to install Cursor. Install curl, then refresh detected agents.\\n'; fi",
        "if (Get-Command irm -ErrorAction SilentlyContinue) { irm 'https://cursor.com/install?win32=true' | iex } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod first, then refresh detected agents.' }",
      ),
  },
  {
    id: "gemini",
    acpRegistryAliases: [{ id: "gemini", nativeSupport: true }],
    description: msg`First-class Gemini CLI integration using Poracode's native runtime.`,
    docsUrl: "https://github.com/google-gemini/gemini-cli",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v npm >/dev/null 2>&1; then npm install -g @google/gemini-cli; else " +
          POSIX_MISSING_NPM_MESSAGE +
          "; fi",
        "if (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g @google/gemini-cli } else { Write-Host 'No supported installer found. Install Node.js/npm first, then refresh detected agents.' }",
      ),
  },
  {
    id: "qwen",
    description: msg`First-class Qwen Code integration using Poracode's native terminal and ACP runtimes.`,
    docsUrl: "https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash; " +
          "elif command -v brew >/dev/null 2>&1; then brew install qwen-code; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @qwen-code/qwen-code@latest; else " +
          MAC_MISSING_CURL_BREW_NPM_MESSAGE +
          "; fi",
        posix:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @qwen-code/qwen-code@latest; else " +
          POSIX_MISSING_CURL_NPM_MESSAGE +
          "; fi",
        windows:
          "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex } elseif (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g @qwen-code/qwen-code@latest } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod or Node.js/npm first, then refresh detected agents.' }",
      }),
  },
  {
    id: "qoder",
    acpRegistryAliases: [{ id: "qoder", nativeSupport: true }],
    description: msg`First-class Qoder CLI integration using Poracode's native terminal and ACP runtimes.`,
    docsUrl: "https://docs.qoder.com/en/cli/quick-start",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://qoder.com/install | bash; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @qoder-ai/qodercli@latest; else " +
          POSIX_MISSING_CURL_NPM_MESSAGE +
          "; fi",
        "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://qoder.com/install.ps1 | iex } elseif (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g @qoder-ai/qodercli@latest } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod or Node.js/npm first, then refresh detected agents.' }",
      ),
  },
  {
    id: "copilot",
    acpRegistryAliases: [
      { id: "github-copilot", nativeSupport: true },
      { id: "github-copilot-cli", nativeSupport: true },
    ],
    description: msg`First-class GitHub Copilot CLI integration using Poracode's native runtime.`,
    docsUrl:
      "https://docs.github.com/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://gh.io/copilot-install | bash; " +
          "elif command -v brew >/dev/null 2>&1; then brew install --cask copilot-cli; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @github/copilot; else " +
          MAC_MISSING_CURL_BREW_NPM_MESSAGE +
          "; fi",
        posix:
          "if command -v curl >/dev/null 2>&1; then curl -fsSL https://gh.io/copilot-install | bash; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @github/copilot; else " +
          POSIX_MISSING_CURL_NPM_MESSAGE +
          "; fi",
        windows:
          "if (Get-Command winget -ErrorAction SilentlyContinue) { winget install GitHub.Copilot } elseif (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g @github/copilot } else { Write-Host 'No supported installer found. Install WinGet or Node.js/npm first, then refresh detected agents.' }",
      }),
  },
];

function buildAcpRegistryAliasMap(
  entries: readonly NativeAgentRegistryEntry[],
): Map<string, { familyKind: AgentKind; nativeSupport: boolean }> {
  const aliases = new Map<string, { familyKind: AgentKind; nativeSupport: boolean }>();
  for (const entry of entries) {
    for (const alias of entry.acpRegistryAliases ?? []) {
      if (aliases.has(alias.id)) {
        throw new Error(`Duplicate native ACP registry alias: ${alias.id}`);
      }
      aliases.set(alias.id, {
        familyKind: entry.id,
        nativeSupport: alias.nativeSupport === true,
      });
    }
  }
  return aliases;
}

const ACP_REGISTRY_ALIASES = buildAcpRegistryAliasMap(NATIVE_AGENT_REGISTRY_ENTRIES);

export const KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS: ReadonlySet<string> = new Set(
  ACP_REGISTRY_ALIASES.keys(),
);

export const APP_SUPPORTED_ACP_AGENT_IDS: ReadonlySet<string> = new Set(
  [...ACP_REGISTRY_ALIASES].filter(([, alias]) => alias.nativeSupport).map(([agentId]) => agentId),
);

export const REGISTRY_AGENT_FAMILY_KIND: Readonly<Record<string, AgentKind>> = Object.freeze(
  Object.fromEntries(
    [...ACP_REGISTRY_ALIASES].map(([agentId, alias]) => [agentId, alias.familyKind]),
  ),
);
