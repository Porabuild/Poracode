import { migrateCursorBaseId } from "@/shared/cursorModelId";
import { baseAgentKind } from "@/shared/contracts";
import {
  capitalizeSegment,
  formatBracketParamHints,
  formatCursorBaseModelLabel,
  stripBracketParams,
} from "@/shared/modelLabels";

export function formatShortcutFallbackLabel(agentKind: string, modelId: string): string {
  const baseId = stripBracketParams(modelId);
  const baseLabel =
    baseAgentKind(agentKind) === "cursor"
      ? formatCursorBaseModelLabel(migrateCursorBaseId(baseId))
      : baseId
          .split(/[-_/]/g)
          .filter(Boolean)
          .map((part) => capitalizeSegment(part))
          .join(" ");

  const hints = modelId.includes("[")
    ? formatBracketParamHints(modelId, { includeEffort: false, includeFast: false })
    : undefined;
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

  let next = label;

  if (baseAgentKind(agentKind) === "cursor" && modelId.includes("[")) {
    const hints = formatBracketParamHints(modelId, { includeEffort: false, includeFast: false });
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
