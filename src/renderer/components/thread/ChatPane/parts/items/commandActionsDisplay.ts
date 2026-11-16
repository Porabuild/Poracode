/**
 * Display derivation for provider-classified command `actions`
 * (`commandExecution.actions`), used by command rows, grouped headers, and
 * categorization. Actions win over command-line heuristics when present and
 * fully known; `commandPayloadDisplay` is the single entry point.
 */
import { msg } from "@lingui/core/macro";
import type { CommandAction, CommandExecutionPayload } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import {
  basenameFromPath,
  commandIntentDisplay,
  finalizeTitle,
  scopeDisplayPath,
  viewPrefix,
  type CommandIntentDisplay,
  type CommandIntentKind,
} from "./commandSummary";

const COMMAND_ACTION_KINDS = new Set(["read", "list", "search"]);

/**
 * Display for provider-classified command parts (`commandExecution.actions`).
 * Returns null when there are no actions or any action kind is unknown, so
 * callers fall back to the command-line heuristics.
 */
export function commandActionsDisplay(
  actions: CommandAction[] | undefined,
): CommandIntentDisplay | null {
  if (!actions || actions.length === 0) return null;
  if (actions.some((action) => !COMMAND_ACTION_KINDS.has(action.kind))) return null;
  if (actions.length === 1) return singleCommandActionDisplay(actions[0]!);
  return multipleCommandActionsDisplay(actions);
}

function commandActionKind(action: CommandAction): CommandIntentKind {
  if (action.kind === "read") return "view";
  if (action.kind === "list") return "list";
  return "search";
}

function singleCommandActionDisplay(action: CommandAction): CommandIntentDisplay | null {
  if (action.kind === "read") {
    const label = action.name ?? (action.path ? basenameFromPath(action.path) : undefined);
    if (!label) return null;
    const prefix = viewPrefix();
    return {
      title: `${prefix}${label}`,
      ...(action.path
        ? { parts: { prefix, path: action.path, filePath: !action.path.includes("$") } }
        : {}),
      kind: "view",
    };
  }
  if (action.kind === "list") {
    return { title: `${i18n._(msg`List`)}: ${action.path ?? "."}`, kind: "list" };
  }
  const query = action.query?.trim();
  const scope = action.path ? scopeDisplayPath(action.path) : undefined;
  if (query && scope) {
    return { title: i18n._(msg`Search: "${query}" in ${scope}`), kind: "search" };
  }
  if (query) return { title: `${i18n._(msg`Search`)}: "${query}"`, kind: "search" };
  if (scope) return { title: `${i18n._(msg`Search`)}: ${scope}`, kind: "search" };
  return null;
}

function multipleCommandActionsDisplay(actions: CommandAction[]): CommandIntentDisplay | null {
  if (actions.every((action) => action.kind === "read")) {
    const labels = actions
      .map((action) => action.name ?? (action.path ? basenameFromPath(action.path) : undefined))
      .filter((label): label is string => !!label);
    if (labels.length === 0) return null;
    return { title: `${viewPrefix()}${finalizeTitle(labels.join(", "))}`, kind: "view" };
  }
  const first = singleCommandActionDisplay(actions[0]!);
  if (!first) return null;
  return {
    title: `${first.title} +${actions.length - 1}`,
    kind: actions.some((action) => action.kind === "search")
      ? "search"
      : commandActionKind(actions[0]!),
  };
}

/**
 * Single source of truth for command-row display: provider-classified
 * `actions` win when present and fully known, otherwise the command-line
 * heuristics. `commandLine` is whatever the caller already displays (the
 * cwd-prefixed line for headers, the bare command elsewhere).
 */
export function commandPayloadDisplay(
  payload: CommandExecutionPayload | undefined,
  commandLine: string,
): CommandIntentDisplay {
  return commandActionsDisplay(payload?.actions) ?? commandIntentDisplay(commandLine);
}
