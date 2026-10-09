/**
 * Devin cloud ACP session-config contracts.
 *
 * Evidence: live no-prompt probes against `devin acp --cloud` 3000.11.3
 * (tmp/devin/e3/results/cloud-session-new.json, cloud-lifecycle.json).
 * Cloud sessions expose a completely different `configOptions` set from the
 * local agent — there is no `model` (family) option, no `mode` option and no
 * `thought_level`; the cloud "model" choice is the `devin_version` select.
 * Because the shared model resolver targets the `model` option only, a cloud
 * profile must classify these options through this module instead.
 *
 * Option ids observed live on this build (account-shaped lists — org repos,
 * personas, version tiers — are data, not contract; only the option ids and
 * the select mechanics are treated as stable):
 *   org_id | repos | persona_slug | devin_version | platform
 */

import { flattenSelectOptionValues } from "@/supervisor/agents/acp/modelConfigOptions";
import { assertBoundedJson } from "@/shared/jsonBounds";

import { DEVIN_ACP_VENDOR_META_PREFIX } from "./capabilityManifest";

/**
 * Cloud config options carry `category: null`, so the shared category-based
 * `findSelectConfigOption` cannot see them — match by exact id instead.
 */
const findCloudSelectById = (
  configOptions: unknown,
  id: string,
): { id?: unknown; type?: unknown; currentValue?: unknown; options?: unknown } | undefined => {
  if (!Array.isArray(configOptions)) return undefined;
  return configOptions.find(
    (candidate): candidate is { id: string; type: string } =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as { id?: unknown }).id === id &&
      (candidate as { type?: unknown }).type === "select",
  );
};

/**
 * Unlike the shared value-flattener (which drops empty strings as
 * meaningless for model selects), cloud selects legitimately use `""` as a
 * value — `persona_slug` offers `""` ("Agent") as its default and `repos`
 * reports `""` while nothing is selected.
 */
const cloudSelectValues = (options: unknown): string[] => {
  if (!Array.isArray(options)) return [];
  return options.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as { value?: unknown; options?: unknown };
    if (typeof record.value === "string") return [record.value];
    return cloudSelectValues(record.options);
  });
};

/** Cloud session config-option ids confirmed live on `devin acp --cloud`. */
export const DEVIN_ACP_CLOUD_CONFIG_OPTION_IDS = {
  orgId: "org_id",
  repos: "repos",
  personaSlug: "persona_slug",
  devinVersion: "devin_version",
  platform: "platform",
} as const;

/** The cloud select that plays the "model" role (`currentValue` on a fresh session: `devin-2-5`). */
export const DEVIN_ACP_CLOUD_VERSION_CONFIG_ID = DEVIN_ACP_CLOUD_CONFIG_OPTION_IDS.devinVersion;

/**
 * Signature-compatible with the shared `resolveModelConfig` seam
 * (`sessionConfig.resolveModelConfigValue`): given the thread config and the
 * live session `configOptions`, return the single config-option push that
 * applies the requested cloud version, or `undefined` when no explicit
 * selection is stored or the session does not offer the option (agent owns
 * the default). Matching is by exact option value only — cloud version ids
 * are opaque slugs (`devin-2-5`, `devin-auto`, …), so no alias fuzzing.
 */
export function resolveDevinAcpCloudVersionConfigValue(
  config: { model?: string | null },
  configOptions: unknown,
): { configId: string; value: string; currentValue?: string } | undefined {
  const requested = typeof config.model === "string" ? config.model.trim() : "";
  if (!requested) return undefined;
  const option = findCloudSelectById(configOptions, DEVIN_ACP_CLOUD_VERSION_CONFIG_ID);
  if (typeof option?.id !== "string") return undefined;
  const candidates = flattenSelectOptionValues(option.options);
  if (!candidates.includes(requested)) return undefined;
  const currentValue = typeof option.currentValue === "string" ? option.currentValue : undefined;
  return {
    configId: option.id,
    value: requested,
    ...(currentValue !== undefined && currentValue !== requested ? { currentValue } : {}),
  };
}

/**
 * Structured view of the cloud session config returned by
 * `session/new`/`session/load`. Lists are passed through verbatim (they are
 * account data); only presence/shape is classified here.
 */
export interface DevinAcpCloudSessionConfig {
  orgId: { id: string; currentValue: string; optionValues: string[] } | undefined;
  repos: { id: string; currentValue: string; optionValues: string[] } | undefined;
  personaSlug: { id: string; currentValue: string; optionValues: string[] } | undefined;
  devinVersion: { id: string; currentValue: string; optionValues: string[] } | undefined;
  platform: { id: string; currentValue: string; optionValues: string[] } | undefined;
  /** Ids not covered by the confirmed set above — fail-visible for new options. */
  unknownOptionIds: string[];
}

const asOptionView = (
  configOptions: unknown,
  id: string,
): { id: string; currentValue: string; optionValues: string[] } | undefined => {
  const option = findCloudSelectById(configOptions, id);
  if (typeof option?.id !== "string") return undefined;
  return {
    id: option.id,
    currentValue: typeof option.currentValue === "string" ? option.currentValue : "",
    optionValues: cloudSelectValues(option.options).slice(0, 500),
  };
};

export function classifyDevinAcpCloudSessionConfig(
  configOptions: unknown,
): DevinAcpCloudSessionConfig {
  const ids = DEVIN_ACP_CLOUD_CONFIG_OPTION_IDS;
  const known = new Set<string>(Object.values(ids));
  const list = Array.isArray(configOptions) ? configOptions : [];
  const unknownOptionIds: string[] = [];
  for (const entry of list) {
    const id = entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined;
    if (typeof id === "string" && !known.has(id)) unknownOptionIds.push(id);
  }
  return {
    orgId: asOptionView(configOptions, ids.orgId),
    repos: asOptionView(configOptions, ids.repos),
    personaSlug: asOptionView(configOptions, ids.personaSlug),
    devinVersion: asOptionView(configOptions, ids.devinVersion),
    platform: asOptionView(configOptions, ids.platform),
    unknownOptionIds,
  };
}

/**
 * Per-option picker metadata observed on cloud selects. Two live variants
 * are confirmed on 3000.11.3:
 *   - fresh `session/new`: the full grouped-picker `_meta` (pickerLabel,
 *     tooltip, toggleable, group/groupName/groupHeader,
 *     section/sectionName/sectionTooltip — lane E3 report §A.5, which also
 *     names the keys; that receipt summarized the meta away);
 *   - archived-view `session/load` (tmp/devin/e4/results/
 *     cloud-load-options.json): sparse variant — `toggleable`, `isFusion`,
 *     `icon`, `isFusionCompatible`.
 * Every field is optional: `_meta` may be absent entirely, and any key
 * outside the known set is surfaced fail-visible instead of dropped.
 */
export interface DevinAcpSelectOptionMeta {
  pickerLabel: string | undefined;
  tooltip: string | undefined;
  toggleable: boolean | undefined;
  icon: string | undefined;
  isFusion: boolean | undefined;
  isFusionCompatible: boolean | undefined;
  /** Grouping label (E3 live shape: group / groupName / groupHeader). */
  groupName: string | undefined;
  groupHeader: string | undefined;
  /** Section label (E3 live shape: section / sectionName / sectionTooltip). */
  sectionName: string | undefined;
  sectionTooltip: string | undefined;
  /** `cognition.ai/*` keys outside the known set — fail-visible. */
  unknownKeys: string[];
}

const PICKER_META_KEYS = {
  pickerLabel: `${DEVIN_ACP_VENDOR_META_PREFIX}pickerLabel`,
  tooltip: `${DEVIN_ACP_VENDOR_META_PREFIX}tooltip`,
  toggleable: `${DEVIN_ACP_VENDOR_META_PREFIX}toggleable`,
  icon: `${DEVIN_ACP_VENDOR_META_PREFIX}icon`,
  isFusion: `${DEVIN_ACP_VENDOR_META_PREFIX}isFusion`,
  isFusionCompatible: `${DEVIN_ACP_VENDOR_META_PREFIX}isFusionCompatible`,
  group: `${DEVIN_ACP_VENDOR_META_PREFIX}group`,
  groupName: `${DEVIN_ACP_VENDOR_META_PREFIX}groupName`,
  groupHeader: `${DEVIN_ACP_VENDOR_META_PREFIX}groupHeader`,
  section: `${DEVIN_ACP_VENDOR_META_PREFIX}section`,
  sectionName: `${DEVIN_ACP_VENDOR_META_PREFIX}sectionName`,
  sectionTooltip: `${DEVIN_ACP_VENDOR_META_PREFIX}sectionTooltip`,
} as const;

const asPickerString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value.slice(0, 200) : undefined;

const asPickerBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

/** Group/section values observed as either bare strings or label records. */
const asLabelish = (value: unknown): string | undefined => {
  const direct = asPickerString(value);
  if (direct) return direct;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return (
      asPickerString(record.name) ?? asPickerString(record.label) ?? asPickerString(record.title)
    );
  }
  return undefined;
};

export function classifyDevinAcpSelectOptionMeta(meta: unknown): DevinAcpSelectOptionMeta {
  const unknownKeys: string[] = [];
  let source: Record<string, unknown> = {};
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    source = meta as Record<string, unknown>;
  } else if (meta !== undefined && meta !== null) {
    return {
      pickerLabel: undefined,
      tooltip: undefined,
      toggleable: undefined,
      icon: undefined,
      isFusion: undefined,
      isFusionCompatible: undefined,
      groupName: undefined,
      groupHeader: undefined,
      sectionName: undefined,
      sectionTooltip: undefined,
      unknownKeys: ["<non-object>"],
    };
  }
  for (const key of Object.keys(source)) {
    if (!Object.values(PICKER_META_KEYS).includes(key as never))
      unknownKeys.push(key.slice(0, 100));
  }
  const groupRecord =
    source[PICKER_META_KEYS.group] &&
    typeof source[PICKER_META_KEYS.group] === "object" &&
    !Array.isArray(source[PICKER_META_KEYS.group])
      ? (source[PICKER_META_KEYS.group] as Record<string, unknown>)
      : undefined;
  const sectionRecord =
    source[PICKER_META_KEYS.section] &&
    typeof source[PICKER_META_KEYS.section] === "object" &&
    !Array.isArray(source[PICKER_META_KEYS.section])
      ? (source[PICKER_META_KEYS.section] as Record<string, unknown>)
      : undefined;
  return {
    pickerLabel: asPickerString(source[PICKER_META_KEYS.pickerLabel]),
    tooltip: asPickerString(source[PICKER_META_KEYS.tooltip]),
    toggleable: asPickerBoolean(source[PICKER_META_KEYS.toggleable]),
    icon: asPickerString(source[PICKER_META_KEYS.icon]),
    isFusion: asPickerBoolean(source[PICKER_META_KEYS.isFusion]),
    isFusionCompatible: asPickerBoolean(source[PICKER_META_KEYS.isFusionCompatible]),
    groupName:
      asLabelish(source[PICKER_META_KEYS.group]) ??
      asPickerString(source[PICKER_META_KEYS.groupName]),
    groupHeader:
      asPickerString(source[PICKER_META_KEYS.groupHeader]) ?? asPickerString(groupRecord?.header),
    sectionName:
      asLabelish(source[PICKER_META_KEYS.section]) ??
      asPickerString(source[PICKER_META_KEYS.sectionName]),
    sectionTooltip:
      asPickerString(source[PICKER_META_KEYS.sectionTooltip]) ??
      asPickerString(sectionRecord?.tooltip),
    unknownKeys,
  };
}

/** One bounded picker row projected from a cloud select option. */
export interface DevinAcpPickerOptionRow {
  value: string;
  name: string;
  description: string | undefined;
  meta: DevinAcpSelectOptionMeta;
}

/** Max picker rows projected per select (cloud lists are ≤ a few hundred). */
const MAX_PICKER_ROWS = 500;

/**
 * Project a cloud select's options into bounded picker rows for the grouped
 * model picker. Nested group levels (SDK `SelectGroup` shape) are walked so
 * grouped payloads resolve the same as flat ones; a list past the row bound
 * fails instead of truncating (a silently cut model list would hide tiers).
 */
export function projectDevinAcpPickerRows(options: unknown): DevinAcpPickerOptionRow[] {
  if (options !== undefined) assertBoundedJson(options, 512 * 1024);
  const rows: DevinAcpPickerOptionRow[] = [];
  const walk = (entries: unknown): void => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (rows.length > MAX_PICKER_ROWS) return;
      if (!entry || typeof entry !== "object") continue;
      const record = entry as {
        value?: unknown;
        name?: unknown;
        description?: unknown;
        options?: unknown;
        _meta?: unknown;
      };
      if (Array.isArray(record.options)) {
        walk(record.options);
        continue;
      }
      if (typeof record.value !== "string" || typeof record.name !== "string") continue;
      rows.push({
        // Wire values are opaque identifiers. Shortening one can select a
        // different value or make two advertised choices indistinguishable.
        // The whole snapshot is bounded above; visual truncation belongs to
        // the picker, without changing the id or accessible label.
        value: record.value,
        name: record.name,
        description: asPickerString(record.description),
        meta: classifyDevinAcpSelectOptionMeta(record._meta),
      });
    }
  };
  walk(options);
  if (rows.length > MAX_PICKER_ROWS) {
    throw new Error(`Cloud select exceeds the picker row bound (${MAX_PICKER_ROWS})`);
  }
  return rows;
}
