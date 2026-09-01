import type { LabeledOption } from "@/shared/contracts";

export const CLAUDE_FABLE_51_MODEL_ID = "claude-fable-5-1";
export const CLAUDE_FABLE_5_MODEL_ID = "claude-fable-5";
export const CLAUDE_OPUS_5_MODEL_ID = "claude-opus-5";
export const CLAUDE_OPUS_48_MODEL_ID = "claude-opus-4-8";
export const CLAUDE_OPUS_47_MODEL_ID = "claude-opus-4-7";
export const CLAUDE_OPUS_46_MODEL_ID = "claude-opus-4-6";
export const CLAUDE_SONNET_5_MODEL_ID = "claude-sonnet-5";
export const CLAUDE_HAIKU_MODEL_ID = "haiku";

export type ClaudeFamily = "fable" | "opus" | "sonnet" | "haiku" | "other";

export interface ParsedClaudeModel {
  family: ClaudeFamily;
  version: number;
  major: number;
  minor: number;
}

export function parseClaudeModelFamily(text: string): ClaudeFamily {
  const norm = text.toLowerCase();
  if (/\bfable\b/i.test(norm) || norm.includes("fable")) return "fable";
  if (/\bopus\b/i.test(norm) || norm.includes("opus")) return "opus";
  if (/\bsonnet\b/i.test(norm) || norm.includes("sonnet")) return "sonnet";
  if (/\bhaiku\b/i.test(norm) || norm.includes("haiku")) return "haiku";
  return "other";
}

export function parseClaudeModelVersion(text: string): {
  version: number;
  major: number;
  minor: number;
} {
  const norm = text.toLowerCase();

  // Dotted version e.g. "5.1", "5.2", "4.8", "3.7"
  const dottedMatch = /(?:^|\b|[a-z]-)(\d+)\.(\d+)(?:\b|$)/i.exec(norm);
  if (dottedMatch) {
    const major = Number(dottedMatch[1]);
    const minor = Number(dottedMatch[2]);
    return { version: Number(`${major}.${minor}`), major, minor };
  }

  // Hyphenated version e.g. "claude-fable-5-1" -> 5.1, "claude-opus-4-8" -> 4.8
  const hyphenMatch = /(?:fable|opus|sonnet|haiku)-(\d+)-(\d+)(?![\d])/i.exec(norm);
  if (hyphenMatch) {
    const major = Number(hyphenMatch[1]);
    const minor = Number(hyphenMatch[2]);
    return { version: Number(`${major}.${minor}`), major, minor };
  }

  // Hyphenated single version e.g. "claude-fable-5" -> 5.0, "claude-opus-5" -> 5.0
  const hyphenSingleMatch = /(?:fable|opus|sonnet|haiku)-(\d+)(?![\d])/i.exec(norm);
  if (hyphenSingleMatch) {
    const major = Number(hyphenSingleMatch[1]);
    return { version: major, major, minor: 0 };
  }

  // Spaced version e.g. "Fable 5", "Opus 5" -> 5.0
  const spacedMatch = /(?:fable|opus|sonnet|haiku)\s+(\d+)(?!\d)/i.exec(norm);
  if (spacedMatch) {
    const major = Number(spacedMatch[1]);
    return { version: major, major, minor: 0 };
  }

  return { version: 0, major: 0, minor: 0 };
}

export function parseClaudeModel(idOrLabel: string): ParsedClaudeModel {
  const family = parseClaudeModelFamily(idOrLabel);
  const { version, major, minor } = parseClaudeModelVersion(idOrLabel);
  return { family, version, major, minor };
}

export function formatClaudeModelLabel(id: string, displayName?: string): string {
  if (displayName?.trim()) {
    const cleaned = displayName
      .replace(/^(?:Claude|Anthropic)\s+/i, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .trim();
    if (cleaned) return cleaned;
  }
  const parsed = parseClaudeModel(id);
  const familyCap =
    parsed.family === "fable"
      ? "Fable"
      : parsed.family === "opus"
        ? "Opus"
        : parsed.family === "sonnet"
          ? "Sonnet"
          : parsed.family === "haiku"
            ? "Haiku"
            : id;
  if (parsed.version > 0) {
    return `${familyCap} ${parsed.version}`;
  }
  return familyCap;
}

/**
 * Checks whether a Claude model supports Auto approval mode.
 * Auto approval mode is supported for:
 * - Default model (empty / undefined)
 * - Fable >= 5.0
 * - Opus >= 4.6
 * - Sonnet >= 4.6 (and bare `sonnet` legacy alias)
 * - Any future non-Haiku / 5.x+ model
 * Filtered out for Haiku and legacy <4.6 models.
 */
export function isClaudeAutoCapable(modelId?: string): boolean {
  if (!modelId?.trim()) return true;
  const parsed = parseClaudeModel(modelId);
  if (parsed.family === "haiku") return false;
  if (parsed.family === "fable") {
    return parsed.version === 0 || parsed.version >= 5.0;
  }
  if (parsed.family === "opus") {
    return parsed.version === 0 || parsed.version >= 4.6;
  }
  if (parsed.family === "sonnet") {
    return parsed.version === 0 || parsed.version >= 4.6;
  }
  // For unknown future families or generic IDs, default to capable unless version is < 4.6
  return parsed.version === 0 || parsed.version >= 4.6;
}

/**
 * Identifies legacy or superseded Claude models that should be hidden by default
 * until the user expands the full model picker list.
 */
export function isLegacyClaudeModel(model: Pick<LabeledOption, "id" | "label">): boolean {
  const parsed = parseClaudeModel(model.id || model.label);
  switch (parsed.family) {
    case "fable":
      // Fable 5.1+ is active; Fable 5.0 is legacy
      return parsed.version > 0 && parsed.version < 5.1;
    case "opus":
      // Opus 5+ is active; Opus 4.8, 4.7, 4.6 are legacy
      return parsed.version > 0 && parsed.version < 5.0;
    case "sonnet":
      // Sonnet 5+ is active; legacy sonnet / 3.7 / 4.x are legacy
      return parsed.version < 5.0;
    case "haiku":
      return false;
    default:
      return parsed.version > 0 && parsed.version < 5.0;
  }
}

export function claudeDefaultHiddenModels(
  models: readonly Pick<LabeledOption, "id" | "label">[],
): string[] {
  return models.filter(isLegacyClaudeModel).map((model) => model.id);
}

const CLAUDE_FAMILY_PRECEDENCE: Record<ClaudeFamily, number> = {
  fable: 0,
  opus: 1,
  sonnet: 2,
  haiku: 3,
  other: 4,
};

/**
 * Sort Claude models: Fable first, then Opus, Sonnet, Haiku, then others.
 * Within each family, models are sorted by version descending (e.g. 5.2 > 5.1 > 5.0 > 4.8).
 */
export function sortClaudeModels<T extends Pick<LabeledOption, "id" | "label">>(
  models: readonly T[],
): T[] {
  return [...models].sort((a, b) => {
    const parsedA = parseClaudeModel(a.id || a.label);
    const parsedB = parseClaudeModel(b.id || b.label);

    const famDiff =
      CLAUDE_FAMILY_PRECEDENCE[parsedA.family] - CLAUDE_FAMILY_PRECEDENCE[parsedB.family];
    if (famDiff !== 0) return famDiff;

    // Same family: sort by version descending (e.g. 5.2 > 5.1 > 5.0 > 4.8)
    const verDiff = parsedB.version - parsedA.version;
    if (verDiff !== 0) return verDiff;

    return a.label.localeCompare(b.label);
  });
}
