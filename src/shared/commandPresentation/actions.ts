import type { CommandAction } from "../contracts/runtimeEvent";
import type { CommandIntent } from "./model";
import { basenameFromPath, finalizeTitle, scopeDisplayPath } from "./shellCommand";

const ACTION_KINDS = new Set(["read", "list", "search"]);

/** Provider-classified canonical actions take precedence only when all are known. */
export function deriveCommandActionsIntent(
  actions: CommandAction[] | undefined,
): CommandIntent | null {
  if (!actions?.length || actions.some((action) => !ACTION_KINDS.has(action.kind))) return null;
  if (actions.length === 1) return singleAction(actions[0]!);
  if (actions.every((action) => action.kind === "read")) {
    const labels = actions
      .map((action) => action.name ?? (action.path ? basenameFromPath(action.path) : undefined))
      .filter((label): label is string => !!label);
    return labels.length
      ? { kind: "view", title: { kind: "view", text: finalizeTitle(labels.join(", ")) } }
      : null;
  }
  const first = singleAction(actions[0]!);
  if (!first) return null;
  return {
    kind: actions.some((action) => action.kind === "search") ? "search" : first.kind,
    title: first.title,
    additionalActions: actions.length - 1,
  };
}

function singleAction(action: CommandAction): CommandIntent | null {
  if (action.kind === "read") {
    const label = action.name ?? (action.path ? basenameFromPath(action.path) : undefined);
    if (!label) return null;
    return {
      kind: "view",
      title: { kind: "view", text: label },
      ...(action.path ? { path: { path: action.path, filePath: !action.path.includes("$") } } : {}),
    };
  }
  if (action.kind === "list")
    return { kind: "list", title: { kind: "label", label: "list", text: action.path ?? "." } };
  const query = action.query?.trim(),
    scope = action.path ? scopeDisplayPath(action.path) : undefined;
  if (query)
    return { kind: "search", title: { kind: "search", query, ...(scope ? { scope } : {}) } };
  return scope ? { kind: "search", title: { kind: "label", label: "search", text: scope } } : null;
}
