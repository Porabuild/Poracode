/**
 * Typed inventory of the standard ACP session config-option shapes.
 *
 * Agents advertise session config options in two negotiated control types —
 * `select` (flat or grouped) and `boolean` (requires the client's boolean
 * capability). The shared session consumes a handful of well-known options
 * (mode, model, thought level, fast, context) elsewhere; this module describes
 * *every* option the agent advertises in neutral terms so the host can be
 * honest about what it understands: anything that is not a supported control
 * type is reported as `unsupported` and must never be mapped onto a control
 * or advertised as one.
 *
 * Pure and vendor-agnostic — shapes are matched structurally, never by wire
 * name.
 */

import type {
  AcpSessionConfigOptionDescriptor,
  AcpSessionConfigSelectGroupInfo,
  AcpSessionConfigBooleanOption,
  SessionConfigControlRole,
} from "@/shared/contracts/sessionConfigOptions";
export type {
  AcpSessionConfigOptionDescriptor,
  AcpSessionConfigSelectValue,
  AcpSessionConfigSelectGroupInfo,
  AcpSessionConfigBooleanOption,
} from "@/shared/contracts/sessionConfigOptions";
import { findSelectConfigOption, findThoughtLevelConfig } from "./sessionConfig";
import {
  findThinkingToggleConfigOption,
  isThinkingToggleConfig,
  resolveThoughtLevelToggleValues,
} from "./thoughtLevel";
import {
  findContextConfigOption,
  findFastConfigOption,
  type AcpSelectBooleanConfigBinding,
} from "./modelConfigOptions";

interface RawConfigOption {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  type?: unknown;
  currentValue?: unknown;
  options?: unknown;
}

function toRawConfigOption(entry: unknown): RawConfigOption | undefined {
  return typeof entry === "object" && entry !== null ? (entry as RawConfigOption) : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

interface RawSelectValue {
  value: string;
  name?: string;
  group?: string;
}

/** Flatten flat-or-grouped select option lists; unknown entries are skipped. */
function flattenSelectValues(raw: unknown, inheritedGroup?: string): RawSelectValue[] {
  if (!Array.isArray(raw)) return [];
  const values: RawSelectValue[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const value = typeof record.value === "string" ? record.value : undefined;
    if (value !== undefined) {
      const name = optionalString(record.name);
      values.push({
        value,
        ...(name ? { name } : {}),
        ...(inheritedGroup ? { group: inheritedGroup } : {}),
      });
      continue;
    }
    // A group entry: carries its own group id and a nested options list.
    const group = optionalString(record.group);
    if (group && Array.isArray(record.options)) {
      values.push(...flattenSelectValues(record.options, group));
    }
  }
  return values;
}

function listSelectGroupInfos(raw: unknown): AcpSessionConfigSelectGroupInfo[] {
  if (!Array.isArray(raw)) return [];
  const groups: AcpSessionConfigSelectGroupInfo[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const group = optionalString(record.group);
    if (group && Array.isArray(record.options)) {
      groups.push({
        id: group,
        ...(optionalString(record.name) ? { name: optionalString(record.name)! } : {}),
      });
    }
  }
  return groups;
}

/**
 * Describe every config option the agent currently advertises. Corrupt
 * entries (non-objects) are skipped; addressable options without a supported
 * control shape are reported as `unsupported` rather than dropped.
 */
export function describeConfigOptions(
  configOptions: unknown,
): readonly AcpSessionConfigOptionDescriptor[] {
  if (!Array.isArray(configOptions)) return [];
  const descriptors: AcpSessionConfigOptionDescriptor[] = [];
  for (const entry of configOptions) {
    const option = toRawConfigOption(entry);
    if (!option) continue;
    const name = optionalString(option.name);
    const category = optionalString(option.category);
    const meta = {
      ...(name ? { name } : {}),
      ...(category ? { category } : {}),
    };
    const id = optionalString(option.id);
    const controlType =
      typeof option.type === "string" && option.type.length > 0 ? option.type : undefined;

    if (option.type === "select" && id) {
      const currentValue =
        typeof option.currentValue === "string" ? option.currentValue : undefined;
      descriptors.push({
        type: "select",
        id,
        ...meta,
        ...(currentValue !== undefined ? { currentValue } : {}),
        values: flattenSelectValues(option.options),
        groups: listSelectGroupInfos(option.options),
      });
      continue;
    }

    if (option.type === "boolean") {
      if (id && typeof option.currentValue === "boolean") {
        descriptors.push({ type: "boolean", id, ...meta, currentValue: option.currentValue });
      } else {
        // A boolean control without an addressable id or a boolean state
        // cannot be honored; keep it visible as unsupported.
        descriptors.push({
          type: "unsupported",
          ...(id ? { id } : {}),
          ...meta,
          ...(controlType ? { controlType } : {}),
        });
      }
      continue;
    }

    descriptors.push({
      type: "unsupported",
      ...(id ? { id } : {}),
      ...meta,
      ...(controlType ? { controlType } : {}),
    });
  }
  return descriptors;
}

/**
 * Which existing composer field each standard control feeds, resolved with
 * the same generic raw selectors the shared session uses to drive them —
 * never by vendor strings. An option keeps a role only where a standard
 * selector claims it; everything else stays inventory-only. A declared
 * {@link AcpSelectBooleanConfigBinding} selects the fast control the same
 * way the sync does — the exact bound select, only when its two distinct
 * values are genuinely advertised — and displaces the boolean-pair sniff.
 */
function resolveComposerRoleIds(
  configOptions: unknown,
  binding?: AcpSelectBooleanConfigBinding,
): Map<string, SessionConfigControlRole> {
  const roleById = new Map<string, SessionConfigControlRole>();
  const tag = (option: { id?: string } | undefined, role: SessionConfigControlRole): void => {
    const id = option?.id;
    if (!id || roleById.has(id)) return;
    roleById.set(id, role);
  };
  // The thought-level select is the effort ladder unless it is a thinking
  // on/off toggle, in which case it feeds the thinking field instead.
  const thoughtLevel = findThoughtLevelConfig(configOptions);
  if (thoughtLevel && !isThinkingToggleConfig(thoughtLevel)) {
    tag(thoughtLevel, "effort");
  } else if (resolveThoughtLevelToggleValues(thoughtLevel)) {
    tag(thoughtLevel, "thinking");
  }
  const thinking = findThinkingToggleConfigOption(configOptions);
  if (resolveThoughtLevelToggleValues(thinking)) tag(thinking, "thinking");
  tag(findSelectConfigOption(configOptions, "mode"), "mode");
  // Category matching can hand back a reasoning selector filed under the
  // model category; the config fold applies the same id guard before it
  // treats a select as the model control.
  const modelSelect = findSelectConfigOption(configOptions, "model");
  if (modelSelect && modelSelect.id !== thoughtLevel?.id) {
    tag(modelSelect, "model");
  }
  tag(findFastConfigOption(configOptions, binding), "fast");
  tag(findContextConfigOption(configOptions), "context");
  return roleById;
}

/**
 * Describe every advertised config option and mark the existing composer
 * field each standard control feeds. Native ids, labels, groups and values
 * stay exactly as the agent advertised; unsupported options keep no role.
 * The plain {@link describeConfigOptions} projection stays role-free.
 * `binding` selects the fast control exactly as {@link findFastConfigOption}
 * does with one — passing the session's declared binding is what marks the
 * bound native select as the composer's fast field.
 */
export function describeConfigOptionsWithRoles(
  configOptions: unknown,
  binding?: AcpSelectBooleanConfigBinding,
): readonly AcpSessionConfigOptionDescriptor[] {
  const descriptors = describeConfigOptions(configOptions);
  const roleById = resolveComposerRoleIds(configOptions, binding);
  if (roleById.size === 0) return descriptors;
  return descriptors.map((descriptor) => {
    if (descriptor.id === undefined) return descriptor;
    const role = roleById.get(descriptor.id);
    return role ? { ...descriptor, role } : descriptor;
  });
}

/** Boolean options the agent advertises; empty unless the capability is on. */
export function listBooleanConfigOptions(
  configOptions: unknown,
): readonly AcpSessionConfigBooleanOption[] {
  return describeConfigOptions(configOptions).filter(
    (descriptor): descriptor is AcpSessionConfigBooleanOption => descriptor.type === "boolean",
  );
}

/**
 * Find one advertised option by its exact wire id in a retained (normalized)
 * option list. Structural and lossless — unlike the descriptors above it
 * keeps the raw entry, so validation can honor every wire value including
 * legitimate empty strings.
 */
export function findAdvertisedConfigOption(
  configOptions: readonly unknown[],
  configId: string,
): Record<string, unknown> | undefined {
  for (const entry of configOptions) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (record.id === configId) return record;
  }
  return undefined;
}

/**
 * Every select value id the option advertises, flat or grouped — including
 * legitimate empty-string values, which are real wire value ids. Non-select
 * options yield nothing.
 */
export function listAdvertisedSelectValueIds(
  option: Record<string, unknown> | undefined,
): string[] {
  if (!option || option.type !== "select" || !Array.isArray(option.options)) return [];
  return flattenRawSelectValueIds(option.options);
}

function flattenRawSelectValueIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const values: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.value === "string") {
      values.push(record.value);
      continue;
    }
    if (typeof record.group === "string" && Array.isArray(record.options)) {
      values.push(...flattenRawSelectValueIds(record.options));
    }
  }
  return values;
}
