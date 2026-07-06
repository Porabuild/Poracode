import { migrateCursorBaseId } from "@/shared/cursorModelId";
import {
  capitalizeSegment,
  formatBracketParamHints,
  formatCursorBaseModelLabel,
  stripBracketParams,
} from "@/shared/modelLabels";

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

export function formatShortcutFallbackLabel(agentKind: string, modelId: string): string {
  const baseId = stripBracketParams(modelId);
  const baseLabel =
    agentKind === "cursor"
      ? formatCursorBaseModelLabel(migrateCursorBaseId(baseId))
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
