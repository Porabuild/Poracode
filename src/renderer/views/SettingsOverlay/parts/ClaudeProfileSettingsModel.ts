import { CLAUDE_EFFORT_TIERS } from "@/shared/agents/claudeEfforts";
import type {
  AgentInstanceConfig,
  AgentInstanceEnvVar,
  ClaudeProfileInstanceConfig,
} from "@/shared/contracts";
import { isEncryptedSecret } from "@/shared/secretFormat";

export const SAVED_SECRET_MASK = "••••••••";

const SENSITIVE_KEY_RE = /(token|secret|password|api[_-]?key|auth)/iu;

export const GLM_PRESET_ROWS: ReadonlyArray<{
  key: string;
  value: string;
  sensitive: boolean;
}> = [
  { key: "ANTHROPIC_BASE_URL", value: "https://api.z.ai/api/anthropic", sensitive: false },
  { key: "ANTHROPIC_AUTH_TOKEN", value: "", sensitive: true },
  { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: "glm-5.2", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: "glm-5.2", sensitive: false },
  { key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", value: "glm-4.5-air", sensitive: false },
  { key: "API_TIMEOUT_MS", value: "3000000", sensitive: false },
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

export function appendGlmPresetRows(rows: readonly EnvRow[], nextRowId: () => string): EnvRow[] {
  const present = new Set(rows.map((row) => row.key.trim()));
  const additions = GLM_PRESET_ROWS.filter((preset) => !present.has(preset.key)).map((preset) => ({
    rowId: nextRowId(),
    key: preset.key,
    value: preset.value,
    sensitive: preset.sensitive,
    replacing: false,
  }));
  return [...rows, ...additions];
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
