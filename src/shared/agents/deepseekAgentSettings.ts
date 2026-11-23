/**
 * User-configured DeepSeek Harness launch settings, stored in
 * `agentSettings.deepseek` and compiled into the staged `--patch` overlay on
 * every `dsh acp` launch. Omitted or default values leave the Harness defaults
 * untouched.
 */

export const DEEPSEEK_CODE_MODE_SETTING_KEY = "codeMode";
export const DEEPSEEK_APPLY_PATCH_SETTING_KEY = "applyPatch";
export const DEEPSEEK_READ_BEFORE_EDIT_SETTING_KEY = "readBeforeEdit";
export const DEEPSEEK_SESSION_SEARCH_SETTING_KEY = "sessionSearch";
export const DEEPSEEK_RALPH_LOOP_SETTING_KEY = "ralphLoop";
export const DEEPSEEK_OFFICE_TOOLS_SETTING_KEY = "officeTools";
export const DEEPSEEK_SUBAGENT_INTERRUPT_SETTING_KEY = "subagentInterrupt";
export const DEEPSEEK_WEB_SEARCH_PROVIDER_SETTING_KEY = "webSearchProvider";
export const DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY = "webFetchProvider";
export const DEEPSEEK_WEB_BILLING_SETTING_KEY = "webBilling";
export const DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY = "webSearchCount";
export const DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY = "maxSubagentDepth";
export const DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY = "maxActiveSubagents";
export const DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY = "maxParallelToolCalls";
export const DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY = "shellTimeoutSeconds";
export const DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY = "uploadSessionLog";

export const DEEPSEEK_WEB_SEARCH_PROVIDERS = ["deepseek-search-api", "deepseek-official"] as const;
export type DeepSeekWebSearchProvider = (typeof DEEPSEEK_WEB_SEARCH_PROVIDERS)[number];

export const DEEPSEEK_WEB_FETCH_PROVIDERS = ["http", "deepseek-fetch-api"] as const;
export type DeepSeekWebFetchProvider = (typeof DEEPSEEK_WEB_FETCH_PROVIDERS)[number];

export const DEEPSEEK_WEB_BILLING_MODES = ["auto", "account", "api-key"] as const;
export type DeepSeekWebBillingMode = (typeof DEEPSEEK_WEB_BILLING_MODES)[number];

export const DEEPSEEK_INT_SETTING_BOUNDS = {
  [DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY]: { min: 1, max: 50 },
  [DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY]: { min: 0, max: 16 },
  [DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY]: { min: 1, max: 64 },
  [DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY]: { min: 1, max: 64 },
  [DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY]: { min: 5, max: 600 },
} as const;

export type DeepSeekIntSettingKey = keyof typeof DEEPSEEK_INT_SETTING_BOUNDS;

export const DEEPSEEK_AGENT_SETTING_DEFAULTS: Readonly<Record<string, boolean | string>> =
  Object.freeze({
    [DEEPSEEK_CODE_MODE_SETTING_KEY]: false,
    [DEEPSEEK_APPLY_PATCH_SETTING_KEY]: false,
    [DEEPSEEK_READ_BEFORE_EDIT_SETTING_KEY]: false,
    [DEEPSEEK_SESSION_SEARCH_SETTING_KEY]: false,
    [DEEPSEEK_RALPH_LOOP_SETTING_KEY]: false,
    [DEEPSEEK_OFFICE_TOOLS_SETTING_KEY]: false,
    [DEEPSEEK_SUBAGENT_INTERRUPT_SETTING_KEY]: false,
    [DEEPSEEK_WEB_SEARCH_PROVIDER_SETTING_KEY]: "",
    [DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY]: "",
    [DEEPSEEK_WEB_BILLING_SETTING_KEY]: "",
    [DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY]: "",
    [DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY]: "",
    [DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY]: "",
    [DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY]: "",
    [DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY]: "",
    [DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY]: true,
  });

export interface DeepSeekAgentSettings {
  codeMode: boolean;
  applyPatch: boolean;
  readBeforeEdit: boolean;
  sessionSearch: boolean;
  ralphLoop: boolean;
  officeTools: boolean;
  subagentInterrupt: boolean;
  webSearchProvider?: DeepSeekWebSearchProvider;
  webFetchProvider?: DeepSeekWebFetchProvider;
  webBilling?: DeepSeekWebBillingMode;
  webSearchCount?: number;
  maxSubagentDepth?: number;
  maxActiveSubagents?: number;
  maxParallelToolCalls?: number;
  shellTimeoutSeconds?: number;
  uploadSessionLog: boolean;
}

function readEnum<T extends string>(
  settings: Readonly<Record<string, boolean | string>> | undefined,
  key: string,
  allowed: readonly T[],
  defaultValue?: T,
): T | undefined {
  const value = settings?.[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!(allowed as readonly string[]).includes(trimmed)) return undefined;
  return trimmed === defaultValue ? undefined : (trimmed as T);
}

export function parseDeepSeekIntSetting(
  key: DeepSeekIntSettingKey,
  raw: string,
): number | undefined {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  const { min, max } = DEEPSEEK_INT_SETTING_BOUNDS[key];
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : undefined;
}

function readInt(
  settings: Readonly<Record<string, boolean | string>> | undefined,
  key: DeepSeekIntSettingKey,
): number | undefined {
  const value = settings?.[key];
  return typeof value === "string" ? parseDeepSeekIntSetting(key, value) : undefined;
}

export function resolveDeepSeekAgentSettings(
  settings?: Readonly<Record<string, boolean | string>>,
): DeepSeekAgentSettings {
  const webSearchProvider = readEnum(
    settings,
    DEEPSEEK_WEB_SEARCH_PROVIDER_SETTING_KEY,
    DEEPSEEK_WEB_SEARCH_PROVIDERS,
  );
  // "http" and "auto" match dsh-base's shipped defaults; normalize them to
  // undefined so default-equivalent values neither enable Reset nor split the
  // pooled dsh process.
  const webFetchProvider = readEnum(
    settings,
    DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY,
    DEEPSEEK_WEB_FETCH_PROVIDERS,
    "http",
  );
  const webBilling = readEnum(
    settings,
    DEEPSEEK_WEB_BILLING_SETTING_KEY,
    DEEPSEEK_WEB_BILLING_MODES,
    "auto",
  );
  const webSearchCount = readInt(settings, DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY);
  const maxSubagentDepth = readInt(settings, DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY);
  const maxActiveSubagents = readInt(settings, DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY);
  const maxParallelToolCalls = readInt(settings, DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY);
  const shellTimeoutSeconds = readInt(settings, DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY);

  return {
    codeMode: settings?.[DEEPSEEK_CODE_MODE_SETTING_KEY] === true,
    applyPatch: settings?.[DEEPSEEK_APPLY_PATCH_SETTING_KEY] === true,
    readBeforeEdit: settings?.[DEEPSEEK_READ_BEFORE_EDIT_SETTING_KEY] === true,
    sessionSearch: settings?.[DEEPSEEK_SESSION_SEARCH_SETTING_KEY] === true,
    ralphLoop: settings?.[DEEPSEEK_RALPH_LOOP_SETTING_KEY] === true,
    officeTools: settings?.[DEEPSEEK_OFFICE_TOOLS_SETTING_KEY] === true,
    subagentInterrupt: settings?.[DEEPSEEK_SUBAGENT_INTERRUPT_SETTING_KEY] === true,
    ...(webSearchProvider ? { webSearchProvider } : {}),
    ...(webFetchProvider ? { webFetchProvider } : {}),
    ...(webBilling ? { webBilling } : {}),
    ...(webSearchCount !== undefined ? { webSearchCount } : {}),
    ...(maxSubagentDepth !== undefined ? { maxSubagentDepth } : {}),
    ...(maxActiveSubagents !== undefined ? { maxActiveSubagents } : {}),
    ...(maxParallelToolCalls !== undefined ? { maxParallelToolCalls } : {}),
    ...(shellTimeoutSeconds !== undefined ? { shellTimeoutSeconds } : {}),
    uploadSessionLog: settings?.[DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY] !== false,
  };
}

export function hasDeepSeekAgentSettingOverrides(
  settings?: Readonly<Record<string, boolean | string>>,
): boolean {
  const resolved = resolveDeepSeekAgentSettings(settings);
  return (
    resolved.codeMode ||
    resolved.applyPatch ||
    resolved.readBeforeEdit ||
    resolved.sessionSearch ||
    resolved.ralphLoop ||
    resolved.officeTools ||
    resolved.subagentInterrupt ||
    resolved.webSearchProvider !== undefined ||
    resolved.webFetchProvider !== undefined ||
    resolved.webBilling !== undefined ||
    resolved.webSearchCount !== undefined ||
    resolved.maxSubagentDepth !== undefined ||
    resolved.maxActiveSubagents !== undefined ||
    resolved.maxParallelToolCalls !== undefined ||
    resolved.shellTimeoutSeconds !== undefined ||
    !resolved.uploadSessionLog
  );
}
