/**
 * User-configured Codex launch defaults, stored in `agentSettings.codex` and
 * injected as `-c key=value` overrides on every Codex launch (PTY and
 * app-server). An absent or empty value means "no override": Codex then falls
 * back to its own `config.toml`, and sub-agents inherit the parent's settings.
 */

export const CODEX_SUBAGENT_MODEL_SETTING_KEY = "subagentModel";
export const CODEX_SUBAGENT_EFFORT_SETTING_KEY = "subagentReasoningEffort";
export const CODEX_MAX_SUBAGENTS_SETTING_KEY = "maxSubagents";
export const CODEX_PLAN_MODE_EFFORT_SETTING_KEY = "planModeReasoningEffort";

export const CODEX_AGENT_SETTING_KEYS = [
  CODEX_SUBAGENT_MODEL_SETTING_KEY,
  CODEX_SUBAGENT_EFFORT_SETTING_KEY,
  CODEX_MAX_SUBAGENTS_SETTING_KEY,
  CODEX_PLAN_MODE_EFFORT_SETTING_KEY,
] as const;

/**
 * Read-only `config.toml` hint keys (not stored settings): the parent
 * session's own model and effort, which sub-agents inherit when unset.
 */
export const CODEX_PARENT_MODEL_HINT_KEY = "parentModel";
export const CODEX_PARENT_EFFORT_HINT_KEY = "parentReasoningEffort";

export const CODEX_MAX_SUBAGENTS_LIMIT = 64;

/**
 * First stable Codex release with the `agents.*` sub-agent keys. Older CLIs
 * parse an unknown `agents.<key>` as an agent-role table and exit at config
 * load, so those overrides must not be sent to them.
 */
const CODEX_AGENTS_CONFIG_MIN_VERSION = [0, 145, 0] as const;

/**
 * True only when `version` (any text containing X.Y.Z) is known to be new
 * enough. A prerelease of the minimum itself may predate the keys, so it does
 * not count.
 */
export function codexVersionSupportsAgentsConfig(version: string | undefined): boolean {
  const match = version ? /(\d+)\.(\d+)\.(\d+)(-[\w.]+)?/.exec(version) : null;
  if (!match) return false;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (const [index, minimum] of CODEX_AGENTS_CONFIG_MIN_VERSION.entries()) {
    if (parts[index]! !== minimum) return parts[index]! > minimum;
  }
  return match[4] === undefined;
}

/**
 * Values are interpolated into a TOML `-c` override that some launch paths
 * (WSL `--`) re-parse through a shell and strip the quotes from. They start
 * with a letter and avoid the bare TOML words, so they can never parse as a
 * non-string scalar.
 */
const MODEL_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:/-]*$/;
const EFFORT_PATTERN = /^[a-z][a-z0-9_-]*$/;
const BARE_TOML_WORDS = new Set(["true", "false", "inf", "nan"]);

export interface CodexAgentSettings {
  subagentModel?: string;
  subagentReasoningEffort?: string;
  maxSubagents?: number;
  planModeReasoningEffort?: string;
}

function readText(
  settings: Record<string, boolean | string> | undefined,
  key: string,
  pattern: RegExp,
): string | undefined {
  const value = settings?.[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return pattern.test(trimmed) && !BARE_TOML_WORDS.has(trimmed) ? trimmed : undefined;
}

export function parseMaxSubagents(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value >= 1 && value <= CODEX_MAX_SUBAGENTS_LIMIT ? value : undefined;
}

export function resolveCodexAgentSettings(
  settings?: Record<string, boolean | string>,
): CodexAgentSettings {
  const subagentModel = readText(settings, CODEX_SUBAGENT_MODEL_SETTING_KEY, MODEL_ID_PATTERN);
  const subagentReasoningEffort = readText(
    settings,
    CODEX_SUBAGENT_EFFORT_SETTING_KEY,
    EFFORT_PATTERN,
  );
  const planModeReasoningEffort = readText(
    settings,
    CODEX_PLAN_MODE_EFFORT_SETTING_KEY,
    EFFORT_PATTERN,
  );
  const rawMax = settings?.[CODEX_MAX_SUBAGENTS_SETTING_KEY];
  const maxSubagents = typeof rawMax === "string" ? parseMaxSubagents(rawMax) : undefined;
  return {
    ...(subagentModel ? { subagentModel } : {}),
    ...(subagentReasoningEffort ? { subagentReasoningEffort } : {}),
    ...(maxSubagents !== undefined ? { maxSubagents } : {}),
    ...(planModeReasoningEffort ? { planModeReasoningEffort } : {}),
  };
}

/**
 * `-c` argv pairs for the configured overrides; empty when nothing is set.
 * The `agents.*` pairs are omitted unless the CLI is known to accept them.
 */
export function codexAgentSettingOverrideArgs(
  settings: Record<string, boolean | string> | undefined,
  supportsAgentsConfig: boolean,
): string[] {
  const resolved = resolveCodexAgentSettings(settings);
  const args: string[] = [];
  if (supportsAgentsConfig && resolved.subagentModel) {
    args.push("-c", `agents.default_subagent_model="${resolved.subagentModel}"`);
  }
  if (supportsAgentsConfig && resolved.subagentReasoningEffort) {
    args.push(
      "-c",
      `agents.default_subagent_reasoning_effort="${resolved.subagentReasoningEffort}"`,
    );
  }
  if (supportsAgentsConfig && resolved.maxSubagents !== undefined) {
    args.push("-c", `agents.max_concurrent_threads_per_session=${resolved.maxSubagents}`);
  }
  if (resolved.planModeReasoningEffort) {
    args.push("-c", `plan_mode_reasoning_effort="${resolved.planModeReasoningEffort}"`);
  }
  return args;
}
