import { migrateCursorBaseId } from "@/shared/cursorModelId";

export function stripBracketParams(modelId: string): string {
  return modelId.replace(/\[[^\]]*\]/g, "");
}

function capitalizeSegment(segment: string): string {
  return segment.length <= 1 ? segment : segment[0]!.toUpperCase() + segment.slice(1);
}

function parseBracketParams(modelId: string): Record<string, string> {
  const match = /\[([^\]]*)\]/.exec(modelId);
  const raw = match?.[1]?.trim();
  if (!raw) return {};

  const params: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (key && value) params[key] = value;
  }
  return params;
}

export function formatBracketParamHints(modelId: string): string | undefined {
  const params = parseBracketParams(modelId);
  const hints: string[] = [];
  if (params.context) hints.push(params.context.toUpperCase());
  const effort = params.reasoning ?? params.effort;
  if (effort) {
    hints.push(effort === "xhigh" ? "Extra High" : capitalizeSegment(effort));
  }
  if (params.fast === "true") hints.push("Fast");
  return hints.length > 0 ? hints.join(" · ") : undefined;
}

function formatCodexShortcutLabel(modelId: string, label: string): string {
  if (!/^gpt-/i.test(modelId) || /\bGPT\b/i.test(label)) return label;

  const suffix = modelId.replace(/^gpt-/i, "");
  const titleSuffix = suffix
    .split("-")
    .map((part) => capitalizeSegment(part))
    .join(" ");
  const compactLabel = label.trim();
  if (
    compactLabel === suffix ||
    compactLabel === titleSuffix ||
    compactLabel === suffix.replace(/-/g, " ") ||
    /^\d/.test(compactLabel)
  ) {
    return `GPT-${titleSuffix}`;
  }
  return label;
}

function formatCursorBaseShortcutLabel(baseId: string): string {
  if (baseId === "default") return "Auto";
  const composer = /^composer-(\d+(?:\.\d+)?)$/i.exec(baseId);
  if (composer) return `Composer ${composer[1]}`;

  const codex = /^gpt-(\d+(?:\.\d+)?)-codex(?:-(spark|max|mini))?$/i.exec(baseId);
  if (codex) {
    const suffix = codex[2] ? ` ${capitalizeSegment(codex[2])}` : "";
    return `Codex ${codex[1]}${suffix}`;
  }

  const gpt = /^gpt-(\d+(?:\.\d+)?)(?:-(mini|nano))?$/i.exec(baseId);
  if (gpt) {
    const suffix = gpt[2] ? ` ${capitalizeSegment(gpt[2])}` : "";
    return `GPT-${gpt[1]}${suffix}`;
  }

  return baseId
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((part) => capitalizeSegment(part))
    .join(" ");
}

export function formatShortcutFallbackLabel(agentKind: string, modelId: string): string {
  const baseId = stripBracketParams(modelId);
  const baseLabel =
    agentKind === "cursor"
      ? formatCursorBaseShortcutLabel(migrateCursorBaseId(baseId))
      : baseId
          .split(/[-_/]/g)
          .filter(Boolean)
          .map((part) => capitalizeSegment(part))
          .join(" ");

  const hints = modelId.includes("[") ? formatBracketParamHints(modelId) : undefined;
  return hints ? `${baseLabel} · ${hints}` : baseLabel;
}

/** Normalize shortcut-section labels (favorites/recents) for cross-provider menus. */
export function formatShortcutModelLabel(
  agentKind: string,
  modelId: string,
  label: string,
): string {
  if (modelId.includes("[") && (label.includes("[") || label === modelId)) {
    return formatShortcutFallbackLabel(agentKind, modelId);
  }

  let next = agentKind === "codex" ? formatCodexShortcutLabel(modelId, label) : label;

  if (agentKind === "cursor" && modelId.includes("[")) {
    const hints = formatBracketParamHints(modelId);
    if (hints && !next.includes(hints)) {
      next = `${next} · ${hints}`;
    }
  }

  return next;
}

export function modelLookupAliases(modelId: string): string[] {
  const aliases = new Set<string>([modelId]);
  const baseId = stripBracketParams(modelId);
  if (baseId !== modelId) aliases.add(baseId);
  const migrated = migrateCursorBaseId(baseId);
  if (migrated !== baseId) aliases.add(migrated);
  return [...aliases];
}
