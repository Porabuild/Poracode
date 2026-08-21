import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { CLAUDE_EFFORT_TIERS } from "@/shared/agents/claudeEfforts";
import type {
  AgentInstanceConfig,
  AgentInstanceEnvVar,
  ClaudeProfileInstanceConfig,
  ClaudeProfileModel,
} from "@/shared/contracts";
import { isEncryptedSecret } from "@/shared/secretFormat";
import { slugifyProfileName } from "./profileIds";

export { slugifyProfileName, uniqueProfileId } from "./profileIds";

export const SAVED_SECRET_MASK = "••••••••";

const SENSITIVE_KEY_RE = /(token|secret|password|api[_-]?key|auth)/iu;

/** A preset env row: the literal value for plain keys; "" for secrets (entered later). */
export type PresetEnvRow = { key: string; value: string; sensitive: boolean };

/**
 * Canonical z.ai (GLM) environment, per https://docs.z.ai/devpack/tool/claude.
 * `glm-5.2[1m]` is z.ai's real model name for the 1M-context GLM 5.2 — the `[1m]`
 * is part of the id, not Poracode's context selector, so it is sent verbatim.
 * `CLAUDE_CODE_AUTO_COMPACT_WINDOW` is required for the 1M context to be usable.
 */
export const ZAI_PRESET_ROWS: ReadonlyArray<PresetEnvRow> = [
  { key: "ANTHROPIC_BASE_URL", value: "https://api.z.ai/api/anthropic", sensitive: false },
  { key: "ANTHROPIC_AUTH_TOKEN", value: "", sensitive: true },
  { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: "glm-5.2[1m]", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: "glm-5.2[1m]", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", value: "glm-4.5-air", sensitive: false },
  { key: "API_TIMEOUT_MS", value: "3000000", sensitive: false },
  { key: "CLAUDE_CODE_AUTO_COMPACT_WINDOW", value: "1000000", sensitive: false },
];

export const DEEPSEEK_PRESET_ROWS: ReadonlyArray<PresetEnvRow> = [
  { key: "ANTHROPIC_BASE_URL", value: "https://api.deepseek.com/anthropic", sensitive: false },
  { key: "ANTHROPIC_AUTH_TOKEN", value: "", sensitive: true },
  { key: "ANTHROPIC_MODEL", value: "deepseek-v4-pro-0813[1m]", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: "deepseek-v4-pro-0813[1m]", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: "deepseek-v4-pro-0813[1m]", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", value: "deepseek-v4-flash", sensitive: false },
  { key: "CLAUDE_CODE_SUBAGENT_MODEL", value: "deepseek-v4-flash", sensitive: false },
  { key: "CLAUDE_CODE_EFFORT_LEVEL", value: "max", sensitive: false },
];

export const MINIMAX_PRESET_ROWS: ReadonlyArray<PresetEnvRow> = [
  { key: "ANTHROPIC_BASE_URL", value: "https://api.minimax.io/anthropic", sensitive: false },
  { key: "ANTHROPIC_AUTH_TOKEN", value: "", sensitive: true },
  { key: "API_TIMEOUT_MS", value: "3000000", sensitive: false },
  { key: "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", value: "1", sensitive: false },
  { key: "ANTHROPIC_MODEL", value: "MiniMax-M3", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: "MiniMax-M3", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: "MiniMax-M3", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", value: "MiniMax-M3", sensitive: false },
  { key: "CLAUDE_CODE_AUTO_COMPACT_WINDOW", value: "512000", sensitive: false },
];

/** Canonical Kimi Code membership environment, per https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html. */
const KIMI_CODE_MODEL_ID = "k3[1m]";
const KIMI_K3_EFFORTS = ["low", "high", "max", "ultracode"] as const;
const KIMI_CODE_MODELS = [
  { id: KIMI_CODE_MODEL_ID, label: "Kimi K3 (1M)" },
  { id: "kimi-for-coding", label: "Kimi K2.7 Code" },
  { id: "kimi-for-coding-highspeed", label: "Kimi K2.7 Code HighSpeed" },
] as const;

export const KIMI_CODE_PRESET_ROWS: ReadonlyArray<PresetEnvRow> = [
  { key: "ANTHROPIC_BASE_URL", value: "https://api.kimi.com/coding/", sensitive: false },
  { key: "ANTHROPIC_API_KEY", value: "", sensitive: true },
  { key: "ANTHROPIC_MODEL", value: KIMI_CODE_MODEL_ID, sensitive: false },
  { key: "ANTHROPIC_DEFAULT_FABLE_MODEL", value: KIMI_CODE_MODEL_ID, sensitive: false },
  { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: KIMI_CODE_MODEL_ID, sensitive: false },
  { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: KIMI_CODE_MODEL_ID, sensitive: false },
  { key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", value: KIMI_CODE_MODEL_ID, sensitive: false },
  { key: "CLAUDE_CODE_SUBAGENT_MODEL", value: KIMI_CODE_MODEL_ID, sensitive: false },
  { key: "CLAUDE_CODE_EFFORT_LEVEL", value: "high", sensitive: false },
  { key: "CLAUDE_CODE_AUTO_COMPACT_WINDOW", value: "1048576", sensitive: false },
  { key: "CLAUDE_CODE_MAX_CONTEXT_TOKENS", value: "1048576", sensitive: false },
];

/**
 * QwenCloud Token Plan Individual uses the Singapore endpoint and an exact model allowlist.
 * Keep this list in sync with the text-generation entries in:
 * https://docs.qwencloud.com/token-plan/personal/token-plan-personal-overview#supported-models
 */
const QWEN_TOKEN_MODEL_ID = "qwen3.8-max";
const QWEN_38_EFFORTS = ["low", "medium", "xHigh"] as const;
const QWEN_TOKEN_PLAN_EFFORTS = ["low", "medium", "high", "xHigh", "max"] as const;
const QWEN_TOKEN_PLAN_MODELS = [
  { id: QWEN_TOKEN_MODEL_ID, label: "Qwen3.8 Max" },
  { id: "qwen3.7-max", label: "Qwen3.7 Max" },
  { id: "qwen3.7-plus", label: "Qwen3.7 Plus" },
  { id: "qwen3.6-flash", label: "Qwen3.6 Flash" },
  { id: "glm-5.2", label: "GLM-5.2" },
  { id: "deepseek-v4-pro-0813", label: "DeepSeek V4 Pro 0813" },
  { id: "deepseek-v4-flash-0731", label: "DeepSeek V4 Flash 0731" },
] as const;
const QWEN_TOKEN_PLAN_MODEL_EFFORTS = {
  [QWEN_TOKEN_MODEL_ID]: QWEN_38_EFFORTS,
  // Claude profiles cannot represent ACP's thinking toggle, so hybrid Qwen
  // models must not inherit Qwen3.8's effort tiers here.
  "qwen3.7-max": [],
  "qwen3.7-plus": [],
  "qwen3.6-flash": [],
  "glm-5.2": ["high", "max"],
  "deepseek-v4-pro-0813": ["high", "max"],
  "deepseek-v4-flash-0731": ["low", "high", "max"],
} as const;

export const QWEN_TOKEN_PLAN_PRESET_ROWS: ReadonlyArray<PresetEnvRow> = [
  {
    key: "ANTHROPIC_BASE_URL",
    value: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic",
    sensitive: false,
  },
  { key: "ANTHROPIC_AUTH_TOKEN", value: "", sensitive: true },
  { key: "ANTHROPIC_MODEL", value: QWEN_TOKEN_MODEL_ID, sensitive: false },
  { key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", value: "qwen3.6-flash", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: QWEN_TOKEN_MODEL_ID, sensitive: false },
  { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: QWEN_TOKEN_MODEL_ID, sensitive: false },
  { key: "CLAUDE_CODE_SUBAGENT_MODEL", value: "qwen3.7-max", sensitive: false },
  { key: "CLAUDE_CODE_MAX_CONTEXT_TOKENS", value: "983616", sensitive: false },
];

/**
 * An external-provider preset offered by the profile editor's preset selector.
 * Add more entries to `PROFILE_PRESETS` to offer additional providers — the UI
 * renders one menu item per preset. A preset seeds env vars, picker models, and
 * the provider's documented effort capabilities.
 */
export interface ProfilePreset {
  id: string;
  label: MessageDescriptor;
  envRows: ReadonlyArray<PresetEnvRow>;
  /** Custom picker models the preset adds. */
  models: readonly { id: string; label: string }[];
  /** Effort tiers the preset keeps (providers often collapse the lower tiers). */
  efforts: readonly string[];
  /** Effort selected for a new thread when the selected model supports it. */
  defaultEffort: string;
  /** Provider-documented effort choices for each custom model. */
  modelEfforts: Readonly<Record<string, readonly string[]>>;
  /** Credential variables that conflict with this preset's authentication scheme. */
  removeEnvKeys?: readonly string[];
  /** Old credential keys whose saved value can move to the preset's canonical key. */
  credentialAliases?: Readonly<Record<string, readonly string[]>>;
}

export const PROFILE_PRESETS: readonly ProfilePreset[] = [
  {
    id: "zai",
    label: msg`z.ai`,
    envRows: ZAI_PRESET_ROWS,
    // glm-5.2[1m] is z.ai's 1M-context GLM 5.2 (the `[1m]` is part of the id).
    models: [{ id: "glm-5.2[1m]", label: "GLM 5.2" }],
    efforts: ["high", "max", "ultracode"],
    defaultEffort: "high",
    modelEfforts: { "glm-5.2[1m]": ["high", "max", "ultracode"] },
  },
  {
    id: "deepseek",
    label: msg`DeepSeek`,
    envRows: DEEPSEEK_PRESET_ROWS,
    models: [
      { id: "deepseek-v4-pro-0813[1m]", label: "DeepSeek V4 Pro 0813" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    ],
    efforts: ["max"],
    defaultEffort: "max",
    modelEfforts: {
      "deepseek-v4-pro-0813[1m]": ["max"],
      "deepseek-v4-flash": ["max"],
    },
  },
  {
    id: "minimax",
    label: msg`MiniMax`,
    envRows: MINIMAX_PRESET_ROWS,
    models: [{ id: "MiniMax-M3", label: "MiniMax M3" }],
    efforts: CLAUDE_EFFORT_TIERS,
    defaultEffort: "high",
    modelEfforts: { "MiniMax-M3": CLAUDE_EFFORT_TIERS },
  },
  {
    id: "kimi-code",
    label: msg`Kimi Code`,
    envRows: KIMI_CODE_PRESET_ROWS,
    models: KIMI_CODE_MODELS,
    efforts: KIMI_K3_EFFORTS,
    defaultEffort: "high",
    modelEfforts: {
      [KIMI_CODE_MODEL_ID]: KIMI_K3_EFFORTS,
      // These aliases can resolve to K2.7 Code, whose thinking must stay on.
      "kimi-for-coding": ["high"],
      "kimi-for-coding-highspeed": ["high"],
    },
    removeEnvKeys: ["ANTHROPIC_AUTH_TOKEN"],
    credentialAliases: { ANTHROPIC_API_KEY: ["ANTHROPIC_AUTH_TOKEN"] },
  },
  {
    id: "qwen-token-plan",
    label: msg`Qwen Token Plan`,
    envRows: QWEN_TOKEN_PLAN_PRESET_ROWS,
    models: QWEN_TOKEN_PLAN_MODELS,
    efforts: QWEN_TOKEN_PLAN_EFFORTS,
    defaultEffort: "xHigh",
    modelEfforts: QWEN_TOKEN_PLAN_MODEL_EFFORTS,
    removeEnvKeys: ["ANTHROPIC_API_KEY"],
  },
];

export interface EnvRow {
  rowId: string;
  key: string;
  value: string;
  sensitive: boolean;
  /** On-disk sealed blob for a saved secret; shown masked until replaced. */
  sealed?: string | undefined;
  /** True while the user is entering a replacement value for a saved secret. */
  replacing: boolean;
}

export interface ModelRow {
  rowId: string;
  id: string;
  label: string;
  /** Undefined inherits the profile-wide effort list; a Set is an explicit override. */
  efforts?: Set<string>;
}

export function defaultConfigDir(name: string): string {
  return `~/.poracode/claude-profiles/${slugifyProfileName(name)}`;
}

export function shouldTreatEnvKeyAsSensitive(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

export function profileUsesExternalProvider(
  instance: AgentInstanceConfig,
  config: ClaudeProfileInstanceConfig,
): boolean {
  const hasEffortOverride =
    config.efforts !== undefined &&
    config.efforts.length > 0 &&
    config.efforts.length < CLAUDE_EFFORT_TIERS.length;
  return Boolean(instance.environment || config.models?.length || hasEffortOverride);
}

export function rowsFromEnvironment(
  environment: AgentInstanceConfig["environment"],
  nextRowId: () => string,
): EnvRow[] {
  return Object.entries(environment ?? {}).map(([key, variable]) => {
    const sensitive = variable.sensitive === true;
    const sealed = sensitive && isEncryptedSecret(variable.value) ? variable.value : undefined;
    return {
      rowId: nextRowId(),
      key,
      value: sealed ? "" : variable.value,
      sensitive,
      sealed,
      replacing: false,
    };
  });
}

export function environmentFromRows(rows: readonly EnvRow[]): Record<string, AgentInstanceEnvVar> {
  const environment: Record<string, AgentInstanceEnvVar> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (row.sensitive) {
      if (row.value.length > 0) {
        environment[key] = { value: row.value, sensitive: true };
      } else if (row.sealed) {
        environment[key] = { value: row.sealed, sensitive: true };
      }
    } else {
      const value = row.value.trim();
      if (value.length > 0) environment[key] = { value };
    }
  }
  return environment;
}

/**
 * Apply a preset to the env rows: upsert every preset key to its canonical value
 * while preserving an already-entered secret (the auth token is never clobbered)
 * and keeping any extra custom rows the user added.
 */
export function applyPresetEnvRows(
  presetRows: ReadonlyArray<PresetEnvRow>,
  rows: readonly EnvRow[],
  nextRowId: () => string,
  removeEnvKeys: readonly string[] = [],
  credentialAliases: Readonly<Record<string, readonly string[]>> = {},
): EnvRow[] {
  const presetKeys = new Set(presetRows.map((preset) => preset.key));
  const removedKeys = new Set(removeEnvKeys);
  const byKey = new Map(rows.map((row) => [row.key.trim(), row] as const));
  const result: EnvRow[] = presetRows.map((preset) => {
    const existing =
      byKey.get(preset.key) ??
      credentialAliases[preset.key]?.map((key) => byKey.get(key)).find(Boolean);
    // Keep a secret the user already supplied (plaintext or sealed) rather than
    // wiping it with the preset's empty placeholder.
    if (existing && preset.sensitive && (existing.value.length > 0 || existing.sealed)) {
      return { ...existing, key: preset.key, sensitive: true };
    }
    if (existing) {
      return { ...existing, value: preset.value, sensitive: preset.sensitive, replacing: false };
    }
    return {
      rowId: nextRowId(),
      key: preset.key,
      value: preset.value,
      sensitive: preset.sensitive,
      replacing: false,
    };
  });
  for (const row of rows) {
    const key = row.key.trim();
    if (!presetKeys.has(key) && !removedKeys.has(key)) result.push(row);
  }
  return result;
}

export function modelsFromConfig(
  models: readonly ClaudeProfileModel[] | undefined,
  modelEfforts: Readonly<Record<string, readonly string[]>> | undefined,
  nextRowId: () => string,
): ModelRow[] {
  return (models ?? []).map((model) => {
    const efforts = modelEfforts?.[model.id];
    return {
      rowId: nextRowId(),
      id: model.id,
      label: model.label ?? "",
      ...(efforts ? { efforts: new Set(efforts) } : {}),
    };
  });
}

/** Rows with a unique, trimmed, non-empty id (first occurrence of each id wins). */
function dedupedModelRows(rows: readonly ModelRow[]): { id: string; row: ModelRow }[] {
  const seen = new Set<string>();
  const result: { id: string; row: ModelRow }[] = [];
  for (const row of rows) {
    const id = row.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, row });
  }
  return result;
}

export function cleanModels(rows: readonly ModelRow[]): ClaudeProfileInstanceConfig["models"] {
  const cleaned: NonNullable<ClaudeProfileInstanceConfig["models"]> = [];
  for (const { id, row } of dedupedModelRows(rows)) {
    const label = row.label.trim();
    cleaned.push(label.length > 0 ? { id, label } : { id });
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

export function modelEffortsFromRows(
  rows: readonly ModelRow[],
  allowedEfforts: ReadonlySet<string>,
): ClaudeProfileInstanceConfig["modelEfforts"] {
  const modelEfforts: NonNullable<ClaudeProfileInstanceConfig["modelEfforts"]> = {};
  for (const { id, row } of dedupedModelRows(rows)) {
    if (!row.efforts) continue;
    modelEfforts[id] = CLAUDE_EFFORT_TIERS.filter(
      (tier) => allowedEfforts.has(tier) && row.efforts?.has(tier),
    );
  }
  return Object.keys(modelEfforts).length > 0 ? modelEfforts : undefined;
}

export function selectedEffortsFromConfig(efforts: readonly string[] | undefined): Set<string> {
  return new Set(
    efforts && efforts.length > 0
      ? CLAUDE_EFFORT_TIERS.filter((tier) => efforts.includes(tier))
      : CLAUDE_EFFORT_TIERS,
  );
}

export function effortsConfigFromSelection(
  selectedEfforts: ReadonlySet<string>,
): string[] | undefined {
  const selected = CLAUDE_EFFORT_TIERS.filter((tier) => selectedEfforts.has(tier));
  return selected.length === 0 || selected.length === CLAUDE_EFFORT_TIERS.length
    ? undefined
    : selected;
}

/**
 * Toggles a tier in/out of the selection, keeping at least one tier enabled so
 * the effort picker always has a choice. Shared by the global and per-model
 * effort selectors.
 */
export function toggleEffortTier(current: ReadonlySet<string>, tier: string): Set<string> {
  const next = new Set(current);
  if (next.has(tier)) {
    if (next.size > 1) next.delete(tier);
  } else {
    next.add(tier);
  }
  return next;
}
