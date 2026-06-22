import { CLAUDE_EFFORT_TIERS } from "@/shared/agents/claudeEfforts";
import type {
  AgentInstanceConfig,
  AgentInstanceEnvVar,
  ClaudeProfileInstanceConfig,
} from "@/shared/contracts";
import { isEncryptedSecret } from "@/shared/secretFormat";

export const SAVED_SECRET_MASK = "••••••••";

const SENSITIVE_KEY_RE = /(token|secret|password|api[_-]?key|auth)/iu;

/** A preset env row: the literal value for plain keys; "" for secrets (entered later). */
export type PresetEnvRow = { key: string; value: string; sensitive: boolean };

/**
 * Canonical z.ai (GLM) environment, per https://docs.z.ai/devpack/tool/claude.
 * `glm-5.2[1m]` is z.ai's real model name for the 1M-context GLM 5.2 — the `[1m]`
 * is part of the id, not Lightcode's context selector, so it is sent verbatim.
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
  { key: "ANTHROPIC_MODEL", value: "deepseek-v4-pro[1m]", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: "deepseek-v4-pro[1m]", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: "deepseek-v4-pro[1m]", sensitive: false },
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

/**
 * An external-provider preset offered by the profile editor's preset selector.
 * Add more entries to `PROFILE_PRESETS` to offer additional providers — the UI
 * renders one menu item per preset. A preset only seeds env vars, picker models,
 * and the effort allow-list; it never changes model visibility.
 */
export interface ProfilePreset {
  id: string;
  label: string;
  envRows: ReadonlyArray<PresetEnvRow>;
  /** Custom picker models the preset adds. */
  models: readonly { id: string; label: string }[];
  /** Effort tiers the preset keeps (providers often collapse the lower tiers). */
  efforts: readonly string[];
}

export const PROFILE_PRESETS: readonly ProfilePreset[] = [
  {
    id: "zai",
    label: "z.ai",
    envRows: ZAI_PRESET_ROWS,
    // glm-5.2[1m] is z.ai's 1M-context GLM 5.2 (the `[1m]` is part of the id).
    models: [{ id: "glm-5.2[1m]", label: "GLM 5.2" }],
    efforts: ["high", "max", "ultracode"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    envRows: DEEPSEEK_PRESET_ROWS,
    models: [
      { id: "deepseek-v4-pro[1m]", label: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    ],
    efforts: ["max"],
  },
  {
    id: "minimax",
    label: "MiniMax",
    envRows: MINIMAX_PRESET_ROWS,
    models: [{ id: "MiniMax-M3", label: "MiniMax M3" }],
    efforts: CLAUDE_EFFORT_TIERS,
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
}

export function slugifyProfileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "profile"
  );
}

export function defaultConfigDir(name: string): string {
  return `~/.lightcode/claude-profiles/${slugifyProfileName(name)}`;
}

export function uniqueProfileId(name: string, existing: Readonly<Record<string, unknown>>): string {
  const base = slugifyProfileName(name);
  let candidate = base;
  let index = 2;
  while (existing[candidate]) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
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
): EnvRow[] {
  const presetKeys = new Set(presetRows.map((preset) => preset.key));
  const byKey = new Map(rows.map((row) => [row.key.trim(), row] as const));
  const result: EnvRow[] = presetRows.map((preset) => {
    const existing = byKey.get(preset.key);
    // Keep a secret the user already supplied (plaintext or sealed) rather than
    // wiping it with the preset's empty placeholder.
    if (existing && preset.sensitive && (existing.value.length > 0 || existing.sealed)) {
      return { ...existing, sensitive: true };
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
    if (!presetKeys.has(row.key.trim())) result.push(row);
  }
  return result;
}

export function modelsFromConfig(
  models: ClaudeProfileInstanceConfig["models"],
  nextRowId: () => string,
): ModelRow[] {
  return (models ?? []).map((model) => ({
    rowId: nextRowId(),
    id: model.id,
    label: model.label ?? "",
  }));
}

export function cleanModels(rows: readonly ModelRow[]): ClaudeProfileInstanceConfig["models"] {
  const seen = new Set<string>();
  const cleaned: NonNullable<ClaudeProfileInstanceConfig["models"]> = [];
  for (const row of rows) {
    const id = row.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = row.label.trim();
    cleaned.push(label.length > 0 ? { id, label } : { id });
  }
  return cleaned.length > 0 ? cleaned : undefined;
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
