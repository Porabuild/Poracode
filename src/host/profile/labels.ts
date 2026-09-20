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

const MCP_SERVER_LABELS: Record<string, string> = {
  codex_apps: "Codex Apps",
};

const ACCOUNT_INSTANCE_LABELS: Record<string, string> = {
  "z-ai": "z.ai",
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
  return instance
    ? `${providerLabel(base)} - ${ACCOUNT_INSTANCE_LABELS[instance] ?? instance}`
    : providerLabel(base);
}

export function mcpServerLabel(serverId: string): string {
  const known = MCP_SERVER_LABELS[serverId];
  if (known) return known;
  const core = serverId.replace(/^claude_ai_/, "").replace(/^plugin_[^_]+_/, "");
  return titleCase(core);
}

const MODEL_KEY_SEPARATOR = String.fromCharCode(0x1f);

/** Compose a stable map key for a (provider, model) pair. */
export function modelKey(provider: string | null, model: string): string {
  return `${provider ?? ""}${MODEL_KEY_SEPARATOR}${model}`;
}

/** Render a `modelKey` back to a human label (e.g. "opus (Claude - work)"). */
export function modelLabel(key: string): string {
  const sep = key.indexOf(MODEL_KEY_SEPARATOR);
  if (sep === -1) return key;
  const provider = key.slice(0, sep);
  const model = key.slice(sep + MODEL_KEY_SEPARATOR.length);
  return provider ? `${model} (${accountLabel(provider)})` : model;
}
