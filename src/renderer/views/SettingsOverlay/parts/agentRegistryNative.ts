import type { AgentKind, Project } from "@/shared/contracts";

export interface NativeAgentRegistryEntry {
  id: AgentKind;
  label: string;
  description: string;
  installCommand: (project: Project) => string;
  docsUrl: string;
  /**
   * Whether the agent can be installed on native Windows. Defaults to `true`.
   * When `false`, native Windows installs are hidden (only WSL/macOS/Linux are
   * offered) since the upstream installer does not support Windows yet.
   */
  supportsWindows?: boolean;
}

const POSIX_MISSING_NPM_MESSAGE =
  "printf 'No supported installer found. Install Node.js/npm first, then refresh detected agents.\\n'";

function isWslProject(project: Project): boolean {
  return project.location.kind === "wsl";
}

function posixOrWindows(project: Project, posix: string, windows: string): string {
  return isWslProject(project) || process.platform !== "win32" ? posix : windows;
}

export const NATIVE_AGENT_REGISTRY_ENTRIES: NativeAgentRegistryEntry[] = [
  {
    id: "codex",
    label: "Codex",
    description: "First-class Codex CLI integration using Lightcode's native app-server runtime.",
    docsUrl: "https://developers.openai.com/codex/cli",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v npm >/dev/null 2>&1; then npm i -g @openai/codex; else " +
          POSIX_MISSING_NPM_MESSAGE +
          "; fi",
        "if (Get-Command npm -ErrorAction SilentlyContinue) { npm i -g @openai/codex } else { Write-Host 'No supported installer found. Install Node.js/npm first, then refresh detected agents.' }",
      ),
  },
  {
    id: "claude",
    label: "Claude Code",
    description: "First-class Claude Code integration using Lightcode's native SDK runtime.",
    docsUrl: "https://code.claude.com/docs/en/setup",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://claude.ai/install.sh | bash; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g @anthropic-ai/claude-code; else " +
          POSIX_MISSING_NPM_MESSAGE +
          "; fi",
        "if (Get-Command winget -ErrorAction SilentlyContinue) { winget install Anthropic.ClaudeCode } elseif (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g @anthropic-ai/claude-code } else { Write-Host 'No supported installer found. Install WinGet or Node.js/npm first, then refresh detected agents.' }",
      ),
  },
  {
    id: "opencode",
    label: "OpenCode",
    description: "First-class OpenCode integration using Lightcode's native SDK runtime.",
    docsUrl: "https://opencode.ai/docs/",
    installCommand: (project) =>
      posixOrWindows(
        project,
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://opencode.ai/install | bash; " +
          "elif command -v npm >/dev/null 2>&1; then npm install -g opencode-ai; else " +
          POSIX_MISSING_NPM_MESSAGE +
          "; fi",
        "if (Get-Command npm -ErrorAction SilentlyContinue) { npm install -g opencode-ai } elseif (Get-Command choco -ErrorAction SilentlyContinue) { choco install opencode } elseif (Get-Command scoop -ErrorAction SilentlyContinue) { scoop install opencode } else { Write-Host 'No supported installer found. Install Node.js/npm, Chocolatey, or Scoop first, then refresh detected agents.' }",
      ),
  },
  {
    id: "grok",
    label: "Grok Build",
    description: "First-class Grok Build CLI integration using Lightcode's native runtime.",
    docsUrl: "https://x.ai/cli",
    // Grok Build only ships a macOS/Linux installer; native Windows is unsupported.
    // On Windows the install button is hidden and WSL targets are offered instead.
    supportsWindows: false,
    installCommand: () =>
      "if command -v curl >/dev/null 2>&1; then curl -fsSL https://x.ai/cli/install.sh | bash; " +
      "else printf 'curl is required to install Grok Build. Install curl, then refresh detected agents.\\n'; fi",
  },
];

export const KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS = new Set(["claude-acp", "codex-acp", "opencode"]);

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
  opencode: "opencode",
};
