import { baseAgentKind } from "@/shared/contracts";

/** Display labels for base provider kinds. */
const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  commandcode: "Command Code",
  copilot: "Copilot",
  gemini: "Gemini",
  grok: "Grok",
  cursor: "Cursor",
  opencode: "OpenCode",
  antigravity: "Antigravity",
  "acp-generic": "ACP Agent",
};

export function titleCase(value: string): string {
  return value
    .split(/[\s_:-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Label for a base provider kind (e.g. "claude" -> "Claude"). */
export function providerLabel(kind: string): string {
  return PROVIDER_LABELS[kind] ?? titleCase(kind);
}

/**
 * Label for an account-scoped agent kind. Folds the provider to its base for the
 * name and appends the instance/profile id, so multiple accounts of the same
 * provider are distinguishable - e.g. "claude:work" -> "Claude - work".
 */
export function accountLabel(agentKind: string): string {
  const sep = agentKind.indexOf(":");
  const base = baseAgentKind(agentKind);
  const instance = sep > 0 ? agentKind.slice(sep + 1) : "";
  return instance ? `${providerLabel(base)} - ${instance}` : providerLabel(base);
}
