import { CLAUDE_EFFORT_TIERS } from "@/shared/agents/claudeEfforts";
import type { AgentCapability } from "@/shared/contracts";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";

const MIN_CLAUDE_OPUS_47_CLI = [2, 1, 111] as const;
const MIN_CLAUDE_OPUS_48_CLI = [2, 1, 154] as const;
const MIN_CLAUDE_FABLE_5_CLI = [2, 1, 170] as const;
const MIN_CLAUDE_SONNET_5_CLI = [2, 1, 197] as const;
const MIN_CLAUDE_OPUS_5_CLI = [2, 1, 219] as const;

export const CLAUDE_OPUS_5_MODEL_ID = "claude-opus-5";
export const CLAUDE_FABLE_5_MODEL_ID = "claude-fable-5";
export const CLAUDE_OPUS_48_MODEL_ID = "claude-opus-4-8";
export const CLAUDE_OPUS_47_MODEL_ID = "claude-opus-4-7";
export const CLAUDE_SONNET_5_MODEL_ID = "claude-sonnet-5";

const CLAUDE_SEMVER_RE = /(\d+)\.(\d+)\.(\d+)/;

/** Effort choices Poracode exposes for Claude's current frontier models. */
export const CLAUDE_PREMIUM_EFFORT_TIERS: string[] = [...CLAUDE_EFFORT_TIERS];

/**
 * Built-in catalog of explicit Claude Code model ids.
 *
 * Order is significant: the first model is Poracode's default for new Claude
 * threads and delegated runs.
 */
export const CLAUDE_BUILTIN_MODELS: AgentCapability["models"] = [
  { id: CLAUDE_OPUS_5_MODEL_ID, label: "Opus 5" },
  { id: CLAUDE_FABLE_5_MODEL_ID, label: "Fable 5" },
  { id: CLAUDE_OPUS_48_MODEL_ID, label: "Opus 4.8" },
  { id: CLAUDE_OPUS_47_MODEL_ID, label: "Opus 4.7" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: CLAUDE_SONNET_5_MODEL_ID, label: "Sonnet 5" },
  { id: "haiku", label: "Haiku" },
];

export const CLAUDE_BUILTIN_MODEL_EFFORTS: AgentCapability["modelEfforts"] = {
  [CLAUDE_OPUS_5_MODEL_ID]: CLAUDE_PREMIUM_EFFORT_TIERS,
  [CLAUDE_FABLE_5_MODEL_ID]: CLAUDE_PREMIUM_EFFORT_TIERS,
  [CLAUDE_OPUS_48_MODEL_ID]: CLAUDE_PREMIUM_EFFORT_TIERS,
  [CLAUDE_OPUS_47_MODEL_ID]: CLAUDE_PREMIUM_EFFORT_TIERS,
  "claude-opus-4-6": ["low", "medium", "high", "max"],
  [CLAUDE_SONNET_5_MODEL_ID]: CLAUDE_PREMIUM_EFFORT_TIERS,
  haiku: [],
};

export const CLAUDE_BUILTIN_MODEL_CONTEXT_SIZES: NonNullable<AgentCapability["modelContextSizes"]> =
  {
    [CLAUDE_OPUS_5_MODEL_ID]: ["1m"],
    [CLAUDE_FABLE_5_MODEL_ID]: ["1m"],
    [CLAUDE_OPUS_48_MODEL_ID]: ["1m", "200k"],
    [CLAUDE_OPUS_47_MODEL_ID]: ["1m", "200k"],
    "claude-opus-4-6": ["1m", "200k"],
    [CLAUDE_SONNET_5_MODEL_ID]: ["1m"],
    // Legacy `sonnet` alias retained for backward compatibility.
    sonnet: ["200k", "1m"],
  };

export const CLAUDE_BUILTIN_FAST_MODELS: NonNullable<AgentCapability["fastModels"]> = [
  CLAUDE_OPUS_5_MODEL_ID,
  CLAUDE_OPUS_48_MODEL_ID,
  CLAUDE_OPUS_47_MODEL_ID,
  "claude-opus-4-6",
];

function parseSemverTriplet(version: string): [number, number, number] | null {
  const match = CLAUDE_SEMVER_RE.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function semverGte(
  actual: [number, number, number],
  minimum: readonly [number, number, number],
): boolean {
  if (actual[0] !== minimum[0]) return actual[0] > minimum[0];
  if (actual[1] !== minimum[1]) return actual[1] > minimum[1];
  return actual[2] >= minimum[2];
}

/** Hide model releases when the installed Claude Code predates their first catalog entry. */
export function claudeCapabilitiesFromCliVersion(
  version: string | undefined,
): Partial<AgentCapability> | undefined {
  if (!version) return undefined;
  const triplet = parseSemverTriplet(version);
  if (!triplet) return undefined;

  const hiddenModelIds = new Set<string>();
  if (!semverGte(triplet, MIN_CLAUDE_OPUS_5_CLI)) {
    hiddenModelIds.add(CLAUDE_OPUS_5_MODEL_ID);
  }
  if (!semverGte(triplet, MIN_CLAUDE_FABLE_5_CLI)) {
    hiddenModelIds.add(CLAUDE_FABLE_5_MODEL_ID);
  }
  if (!semverGte(triplet, MIN_CLAUDE_SONNET_5_CLI)) {
    hiddenModelIds.add(CLAUDE_SONNET_5_MODEL_ID);
  }
  if (!semverGte(triplet, MIN_CLAUDE_OPUS_48_CLI)) {
    hiddenModelIds.add(CLAUDE_OPUS_48_MODEL_ID);
  }
  if (!semverGte(triplet, MIN_CLAUDE_OPUS_47_CLI)) {
    hiddenModelIds.add(CLAUDE_OPUS_47_MODEL_ID);
  }
  if (hiddenModelIds.size === 0) return undefined;

  const models = CLAUDE_BUILTIN_MODELS.filter((model) => !hiddenModelIds.has(model.id));
  const modelEfforts = { ...CLAUDE_BUILTIN_MODEL_EFFORTS };
  const modelContextSizes = { ...CLAUDE_BUILTIN_MODEL_CONTEXT_SIZES };
  for (const modelId of hiddenModelIds) {
    delete modelEfforts[modelId];
    delete modelContextSizes[modelId];
  }
  const fastModels = CLAUDE_BUILTIN_FAST_MODELS.filter((modelId) => !hiddenModelIds.has(modelId));
  return { models, modelEfforts, modelContextSizes, fastModels };
}

function poracodeEffortId(effort: string): string {
  return effort === "xhigh" ? "xHigh" : effort;
}

/**
 * Overlay model-specific effort and Fast metadata reported by Claude Code.
 *
 * The CLI catalog intentionally shows only current aliases, while Poracode also
 * keeps explicit prior model versions selectable. Start from the built-in map
 * and update only entries the SDK actually reports so probing never erases the
 * historical catalog.
 */
export function claudeCapabilitiesFromSdkModels(
  sdkModels: readonly ModelInfo[] | undefined,
): Pick<AgentCapability, "modelEfforts" | "fastModels"> | undefined {
  if (!sdkModels?.length) return undefined;
  const knownModelIds = new Set(CLAUDE_BUILTIN_MODELS.map((model) => model.id));
  const modelEfforts = { ...CLAUDE_BUILTIN_MODEL_EFFORTS };
  const fastModels = new Set(CLAUDE_BUILTIN_FAST_MODELS);
  let matched = false;

  for (const sdkModel of sdkModels) {
    const modelId = [sdkModel.resolvedModel, sdkModel.value]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\[[0-9]+[mk]\]$/i, ""))
      .find((value) => knownModelIds.has(value));
    if (!modelId) continue;
    matched = true;

    if (sdkModel.supportsEffort === false) {
      modelEfforts[modelId] = [];
    } else if (sdkModel.supportedEffortLevels?.length) {
      const efforts = sdkModel.supportedEffortLevels.map(poracodeEffortId);
      // Ultracode is Claude Code's xhigh + dynamic-workflow session preset.
      if (efforts.includes("xHigh")) efforts.push("ultracode");
      modelEfforts[modelId] = efforts;
    }

    if (sdkModel.supportsFastMode === true) {
      fastModels.add(modelId);
    } else if (sdkModel.supportsFastMode === false) {
      fastModels.delete(modelId);
    }
  }

  return matched ? { modelEfforts, fastModels: [...fastModels] } : undefined;
}
