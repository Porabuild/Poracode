import type { ThreadConfig } from "@/shared/contracts";
import { normalizeAcpModeId } from "./probe";

/**
 * Resolve the ACP mode ID from Poracode's ThreadConfig.
 *
 * Different agents expose different mode IDs:
 *   Gemini:  "default", "autoEdit", "yolo", "plan"
 *   Generic: "code", "architect", "ask"
 *
 * We pick the best match from the agent's advertised available modes.
 */
export function resolveAcpMode(
  config: ThreadConfig,
  availableModeIds: string[],
): string | undefined {
  const available = new Map(
    availableModeIds.map((modeId) => [normalizeAcpModeId(modeId).toLowerCase(), modeId]),
  );

  if (config.mode === "plan") {
    if (available.has("plan")) return available.get("plan");
    if (available.has("architect")) return available.get("architect");
    return undefined;
  }

  const approvalPolicy = config.approvalPolicy?.toLowerCase();
  if (approvalPolicy && available.has(approvalPolicy)) {
    return available.get(approvalPolicy);
  }

  if (config.mode === "autopilot" || config.approvalPolicy === "autopilot") {
    if (available.has("autopilot")) return available.get("autopilot");
    if (available.has("yolo")) return available.get("yolo");
  }

  if (config.approvalPolicy === "autopilot") {
    if (available.has("autopilot")) return available.get("autopilot");
  }
  if (config.approvalPolicy === "never") {
    if (available.has("yolo")) return available.get("yolo");
    if (available.has("autopilot")) return available.get("autopilot");
  }
  if (config.approvalPolicy === "auto_edit") {
    if (available.has("autoedit")) return available.get("autoedit");
  }

  if (available.has("agent")) return available.get("agent");
  if (available.has("default")) return available.get("default");
  if (available.has("code")) return available.get("code");

  return undefined;
}

export type AcpConfigOptionLike = {
  id?: string;
  name?: string;
  category?: string | null;
  type?: string;
  currentValue?: string;
  options?: unknown;
};

type AcpConfigSelectOptionLike = {
  value?: string;
  name?: string;
};

type AcpConfigSelectGroupLike = {
  options?: unknown;
};

export function findSelectConfigOption(
  configOptions: unknown,
  category: string,
): AcpConfigOptionLike | undefined {
  if (!Array.isArray(configOptions)) {
    return undefined;
  }

  return configOptions.find((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return false;
    }
    const option = candidate as AcpConfigOptionLike;
    return option.category === category && option.type === "select";
  }) as AcpConfigOptionLike | undefined;
}

export function findThoughtLevelConfig(configOptions: unknown): AcpConfigOptionLike | undefined {
  return findSelectConfigOption(configOptions, "thought_level");
}

function isSelectOption(value: unknown): value is AcpConfigSelectOptionLike {
  return typeof value === "object" && value !== null && "value" in value;
}

function flattenSelectOptions(options: unknown): AcpConfigSelectOptionLike[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.flatMap((entry) => {
    if (isSelectOption(entry)) {
      return [entry];
    }
    if (typeof entry === "object" && entry !== null && "options" in entry) {
      return flattenSelectOptions((entry as AcpConfigSelectGroupLike).options);
    }
    return [];
  });
}

function normalizeConfigOptionAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[[\]]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBracketParams(value: string): Record<string, string> {
  const match = /\[([^\]]*)\]/.exec(value);
  const raw = match?.[1]?.trim();
  if (!raw) return {};

  const params: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    const key = rawKey?.trim();
    const val = rawValue?.trim();
    if (key && val) params[key] = val;
  }
  return params;
}

function modelOptionAliases(option: AcpConfigSelectOptionLike): string[] {
  const aliases = new Set<string>();
  const value = typeof option.value === "string" ? option.value : undefined;
  const name = typeof option.name === "string" ? option.name : undefined;

  for (const candidate of [value, name]) {
    if (candidate) aliases.add(candidate);
  }

  if (value) {
    const base = value.replace(/\[[^\]]*\]/g, "");
    if (base) aliases.add(base);
    const params = parseBracketParams(value);
    const thinking = params.thinking === "true";
    if (params.fast === "true") {
      if (base) aliases.add(`${base}-fast`);
      if (name) aliases.add(`${name}-fast`);
    }
    if (params.context && base) {
      aliases.add(`${base}-${params.context}`);
      if (params.fast === "true") {
        aliases.add(`${base}-${params.context}-fast`);
      }
    }
    const effort = params.reasoning ?? params.effort;
    if (effort && base) {
      aliases.add(`${base}-${effort}`);
      if (params.context) {
        aliases.add(`${base}-${params.context}-${effort}`);
      }
      if (effort === "xhigh") {
        aliases.add(`${base}-extra-high`);
        if (params.context) {
          aliases.add(`${base}-${params.context}-extra-high`);
        }
      } else if (effort === "extra-high") {
        aliases.add(`${base}-xhigh`);
        if (params.context) {
          aliases.add(`${base}-${params.context}-xhigh`);
        }
      }
      if (thinking) {
        aliases.add(`${base}-${effort}-thinking`);
        if (params.context) {
          aliases.add(`${base}-${params.context}-${effort}-thinking`);
        }
        if (effort === "xhigh") {
          aliases.add(`${base}-extra-high-thinking`);
          if (params.context) {
            aliases.add(`${base}-${params.context}-extra-high-thinking`);
          }
        } else if (effort === "extra-high") {
          aliases.add(`${base}-xhigh-thinking`);
          if (params.context) {
            aliases.add(`${base}-${params.context}-xhigh-thinking`);
          }
        }
      }
      if (params.fast === "true") {
        aliases.add(`${base}-${effort}-fast`);
        if (params.context) {
          aliases.add(`${base}-${params.context}-${effort}-fast`);
        }
        if (effort === "xhigh") {
          aliases.add(`${base}-extra-high-fast`);
          if (params.context) {
            aliases.add(`${base}-${params.context}-extra-high-fast`);
          }
        } else if (effort === "extra-high") {
          aliases.add(`${base}-xhigh-fast`);
          if (params.context) {
            aliases.add(`${base}-${params.context}-xhigh-fast`);
          }
        }
        if (thinking) {
          aliases.add(`${base}-${effort}-thinking-fast`);
          if (params.context) {
            aliases.add(`${base}-${params.context}-${effort}-thinking-fast`);
          }
          if (effort === "xhigh") {
            aliases.add(`${base}-extra-high-thinking-fast`);
            if (params.context) {
              aliases.add(`${base}-${params.context}-extra-high-thinking-fast`);
            }
          } else if (effort === "extra-high") {
            aliases.add(`${base}-xhigh-thinking-fast`);
            if (params.context) {
              aliases.add(`${base}-${params.context}-xhigh-thinking-fast`);
            }
          }
        }
      }
    }
    if (base === "default") {
      aliases.add("auto");
    }
  }

  if (name?.toLowerCase() === "auto") {
    aliases.add("auto");
  }

  return [...aliases].map(normalizeConfigOptionAlias);
}

function modelConfigTargetAliases(config: ThreadConfig): string[] {
  const aliases = new Set<string>();
  const modelId = config.model;
  if (!modelId) {
    return [];
  }

  const effortAliases =
    config.effort === "xhigh" ? ["xhigh", "extra-high"] : config.effort ? [config.effort] : [];
  const contextPrefixes =
    config.contextSize && config.contextSize !== "default"
      ? [`${modelId}-${config.contextSize}`]
      : [];
  const modelPrefixes = [...contextPrefixes, modelId];

  for (const prefix of modelPrefixes) {
    for (const effort of effortAliases) {
      if (config.fast === true) {
        if (config.thinking === true) {
          aliases.add(`${prefix}-${effort}-thinking-fast`);
        }
        aliases.add(`${prefix}-${effort}-fast`);
      }
      if (config.thinking === true) {
        aliases.add(`${prefix}-${effort}-thinking`);
      }
      aliases.add(`${prefix}-${effort}`);
    }
    if (config.fast === true) {
      if (config.thinking === true) {
        aliases.add(`${prefix}-thinking-fast`);
      }
      aliases.add(`${prefix}-fast`);
    }
    if (config.thinking === true) {
      aliases.add(`${prefix}-thinking`);
    }
    aliases.add(prefix);
  }

  return [...aliases].map(normalizeConfigOptionAlias);
}

export function resolveModelConfigValue(
  config: ThreadConfig,
  configOptions: unknown,
): { configId: string; value: string; currentValue?: string } | undefined {
  const targets = modelConfigTargetAliases(config);
  if (targets.length === 0) {
    return undefined;
  }
  const option = findSelectConfigOption(configOptions, "model");
  if (!option?.id) {
    return undefined;
  }

  const candidates = flattenSelectOptions(option.options);
  const match = targets
    .map((target) =>
      candidates.find((candidate) =>
        modelOptionAliases(candidate).some((alias) => alias === target),
      ),
    )
    .find((candidate) => candidate !== undefined);
  const value = typeof match?.value === "string" ? match.value : undefined;
  if (!value) {
    return undefined;
  }

  return {
    configId: option.id,
    value,
    ...(option.currentValue ? { currentValue: option.currentValue } : {}),
  };
}

export function applyAcpModeUpdateToConfig(
  currentConfig: ThreadConfig,
  modeId: string,
): ThreadConfig {
  const normalized = normalizeAcpModeId(modeId).toLowerCase();

  if (normalized === "plan" || normalized === "architect") {
    return { ...currentConfig, mode: "plan" };
  }

  if (normalized === "autoedit") {
    return { ...currentConfig, mode: "agent", approvalPolicy: "auto_edit" };
  }

  if (normalized === "autopilot") {
    return {
      ...currentConfig,
      mode: "agent",
      approvalPolicy: currentConfig.approvalPolicy === "autopilot" ? "autopilot" : "never",
    };
  }

  if (normalized === "yolo") {
    return { ...currentConfig, mode: "agent", approvalPolicy: "never" };
  }

  if (normalized !== "agent" && normalized !== "default" && normalized !== "code") {
    return { ...currentConfig, mode: "agent", approvalPolicy: normalizeAcpModeId(modeId) };
  }

  return {
    ...currentConfig,
    mode: "agent",
    approvalPolicy: currentConfig.approvalPolicy === undefined ? undefined : "default",
  };
}
