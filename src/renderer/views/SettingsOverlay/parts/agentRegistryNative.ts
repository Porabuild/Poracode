import type { ComponentType, ReactNode } from "react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type {
  AgentInstanceConfig,
  AgentKind,
  AgentProviderMetadata,
  AgentStatus,
  CreateProfilePayload,
  Project,
} from "@/shared/contracts";
import { isMac, isWindows, readBridge } from "@/renderer/bridge";
import { ClaudeAgentSettingsPanel, claudeProfileSupport } from "./ClaudeProfileSettings";
import { CodexProviderSettings } from "./CodexProviderSettings";
import { cursorProfileSupport } from "./CursorProfileSettings";
import { CursorProviderSettings } from "./CursorProviderSettings";
import { OpenCodeProviderSettings } from "./OpenCodeProviderSettings";
import { cursorAgentInstallCommand, cursorRuntimeSlots } from "./cursorRuntimeInstall";
import type { NativeAgentRuntimeSlots } from "./nativeAgentRuntimes";
import { antigravityCliInstallCommand, antigravityRuntimeSlots } from "./antigravityRuntimeInstall";

/**
 * Props handed to a provider's `settingsPanel`. Panels may consume any
 * subset; `SingleAgentSettings` supplies them all.
 */
export interface NativeAgentSettingsPanelProps {
  agentKind: string;
  statuses: readonly AgentStatus[];
  wslDistros: string[];
  onOpenProfile?: ((profileKind: string) => void) | undefined;
  /**
   * The generic per-environment install/auth rows, handed over when the entry
   * sets `ownsInstallRows`. Panels place them wherever they belong in their own
   * layout instead of having them stranded above the panel.
   */
  installRows?: ReactNode;
}

export interface NativeAgentAcpRegistryAlias {
  id: string;
  /** The app can run this registry agent through its built-in native adapter. */
  nativeSupport?: boolean;
}

/** The one add-form field a provider needs beside the profile name. */
export interface NativeAgentProfileField {
  ariaLabel: MessageDescriptor;
  placeholder?: MessageDescriptor;
  /** Derived placeholder that doubles as the value when left empty. */
  placeholderFor?: (name: string) => string;
  /** Rendered masked and never echoed back once saved. */
  secret?: boolean;
  /** Blocks submission while empty. */
  required?: boolean;
}

/**
 * Declares that a provider supports several profiles, and supplies the only
 * parts of the profile flow that differ between providers. `AgentProfileList`
 * renders everything else, so a new multi-profile provider adds this descriptor
 * plus its `driver` in `AGENT_PROFILE_DRIVERS` and a supervisor profile-adapter
 * factory — no shared file grows a branch.
 */
export interface NativeAgentProfileSupport {
  /** `AgentInstanceConfig.driver` for this provider's profiles. */
  driver: string;
  /** Copy under the shared "Profiles" heading. */
  description: ReactNode;
  field: NativeAgentProfileField;
  /**
   * Secondary line under a profile's name in the list. A component, not a
   * plain render function, so a provider can subscribe to its own settings
   * (Cursor's per-profile runtime) instead of reading a snapshot once.
   */
  RowSubtitle: ComponentType<{ instance: AgentInstanceConfig }>;
  /** What removing this profile costs, shown in the confirmation dialog. */
  removalBody: (profileName: string) => ReactNode;
  /** Turns the add form into a sealed `createProfile` payload. */
  createPayload: (input: {
    id: string;
    displayName: string;
    field: string;
  }) => CreateProfilePayload;
  /**
   * Runs after the instance is created and before the settings flush, for
   * provider settings that must exist by the first detection pass. `statuses`
   * is the base provider's detection, so a provider can pin a setting to what
   * is actually installed (Cursor's GUI runtime) without reaching into a store.
   */
  onCreated?: (input: {
    profileKind: string;
    instance: AgentInstanceConfig;
    statuses: readonly AgentStatus[];
  }) => void;
}

export interface NativeAgentRegistryEntry {
  id: AgentKind;
  description: MessageDescriptor;
  installCommand: (project: Project) => string;
  docsUrl: string;
  /**
   * Providers whose tile hosts several independently installed runtimes declare
   * them here. The registry card then renders install targets, installed tags,
   * versions and update actions generically from these slots plus the detected
   * `AgentStatus.runtimeVariants`, instead of a single all-or-nothing install.
   */
  runtimeSlots?: NativeAgentRuntimeSlots;
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
   * The provider's `settingsPanel` places the per-environment install/auth rows
   * itself (received as `installRows`), so `SingleAgentSettings` stops
   * rendering them above the panel. Used when those rows belong to one of
   * several runtimes the panel groups (e.g. Cursor's CLI-backed ACP runtime).
   */
  ownsInstallRows?: boolean;
  /**
   * Resolve the provider's signed-in account when it isn't part of the
   * detected status (e.g. Antigravity's credential sits in the OS keyring
   * behind its language server). Called when the agent's settings page opens;
   * resolving `undefined` hides the account line.
   */
  accountResolver?: (wslDistros: string[]) => Promise<AgentProviderMetadata | undefined>;
  /**
   * The provider keeps several profiles (extra accounts or configurations),
   * listed on its base settings page and reachable as `<driver>:<id>` agent
   * kinds. Absent for single-account providers.
   */
  profiles?: NativeAgentProfileSupport;
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
    settingsPanel: CodexProviderSettings,
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
    profiles: claudeProfileSupport,
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
    id: "muse",
    description: msg`First-class Muse Code CLI integration using Poracode's native terminal runtime.`,
    docsUrl: "https://dev.meta.ai/docs/muse-code",
    // Muse Code has no native Windows build. WSL projects get the posix curl
    // installer (run inside the distro); a native Windows project gets a clear
    // unsupported message pointing users at WSL or macOS/Linux.
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://dev.meta.ai/install.sh | bash; " +
          "else printf 'curl is required to install Muse Code. Install curl, then refresh detected agents.\\n'; fi",
        "Write-Host 'Muse Code is not available on native Windows. Open a WSL project and install with: curl -fsSL https://dev.meta.ai/install.sh | bash'",
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
    acpRegistryAliases: [{ id: "antigravity-acp", nativeSupport: true }],
    description: msg`First-class Antigravity integration using the agy terminal CLI and Google's official ACP Chat runtime.`,
    docsUrl: "https://antigravity.google/docs/ide/extensions/zed/",
    installCommand: antigravityCliInstallCommand,
    runtimeSlots: antigravityRuntimeSlots,
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
    description: msg`First-class Cursor integration using ACP or the public SDK runtime.`,
    docsUrl: "https://cursor.com/docs/cli/installation",
    installCommand: cursorAgentInstallCommand,
    runtimeSlots: cursorRuntimeSlots,
    settingsPanel: CursorProviderSettings,
    ownsAuthUi: true,
    ownsInstallRows: true,
    profiles: cursorProfileSupport,
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
