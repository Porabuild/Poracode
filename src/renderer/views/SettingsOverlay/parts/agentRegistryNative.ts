import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { AgentKind, Project } from "@/shared/contracts";
import { isMac, isWindows } from "@/renderer/bridge";

export interface NativeAgentRegistryEntry {
  id: AgentKind;
  label: string;
  description: MessageDescriptor;
  installCommand: (project: Project) => string;
  docsUrl: string;
  /**
   * Whether the agent can be installed on native Windows. Defaults to `true`.
   * When `false`, native Windows installs are hidden (only WSL/macOS/Linux are
   * offered) since the upstream installer does not support Windows yet.
   */
  supportsWindows?: boolean;
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
    label: "Codex",
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
    label: "Claude Code",
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
  },
  {
    id: "opencode",
    label: "OpenCode",
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
  },
  {
    id: "grok",
    label: "Grok Build",
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
    id: "antigravity",
    label: "Antigravity",
    description: msg`First-class Antigravity CLI integration using Poracode's native runtime.`,
    docsUrl: "https://antigravity.google/docs/cli-getting-started",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://antigravity.google/cli/install.sh | bash; " +
          "else printf 'curl is required to install Antigravity. Install curl, then refresh detected agents.\\n'; fi",
        "if (Get-Command irm -ErrorAction SilentlyContinue) { irm https://antigravity.google/cli/install.ps1 | iex } elseif (Get-Command curl.exe -ErrorAction SilentlyContinue) { cmd /c \"curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd\" } else { Write-Host 'No supported installer found. Install PowerShell Invoke-RestMethod or curl first, then refresh detected agents.' }",
      ),
  },
  {
    id: "commandcode",
    label: "Command Code",
    description: msg`First-class Command Code CLI integration using Poracode's native runtime.`,
    docsUrl: "https://commandcode.ai/docs/quickstart",
    installCommand: (project) =>
      nativeInstallCommand(project, {
        mac:
          "if command -v npm >/dev/null 2>&1; then npm install -g command-code@latest; else " +
          "printf 'npm is required to install Command Code. Install Node.js/npm first, then refresh detected agents.\\n'; fi",
        posix:
          "if command -v npm >/dev/null 2>&1; then npm install -g command-code@latest; else " +
          "printf 'npm is required to install Command Code. Install Node.js/npm first, then refresh detected agents.\\n'; fi",
        windows:
          "if (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g command-code@latest } else { Write-Host 'No supported installer found. Install Node.js/npm first, then refresh detected agents.' }",
      }),
  },
  {
    id: "cursor",
    label: "Cursor",
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
    label: "Gemini",
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
    id: "copilot",
    label: "GitHub Copilot",
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

export const KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS = new Set([
  "claude-acp",
  "codex-acp",
  "cursor",
  "gemini",
  "github-copilot",
  "github-copilot-cli",
  "grok-build",
  "opencode",
]);

export const APP_SUPPORTED_ACP_AGENT_IDS = new Set([
  "cursor",
  "gemini",
  "github-copilot",
  "github-copilot-cli",
]);

export const REGISTRY_AGENT_FAMILY_KIND: Record<string, AgentKind> = {
  "claude-acp": "claude",
  "codex-acp": "codex",
  cursor: "cursor",
  gemini: "gemini",
  "github-copilot": "copilot",
  "github-copilot-cli": "copilot",
  "grok-build": "grok",
  opencode: "opencode",
};
