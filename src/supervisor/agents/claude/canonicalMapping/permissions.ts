import { posix, win32 } from "node:path";
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import type {
  PermissionRequestDetails,
  PermissionSuggestion,
  RuntimeEvent,
  UserInputOption,
} from "@/shared/contracts";
import { summarizeToolRequest } from "./helpers";
import { classifyRequestType, isExitPlanModeToolName } from "./toolClassification";

export const ACCEPT_SUGGESTION_OPTION_PREFIX = "accept-suggestion-";
const EXIT_PLAN_MODE_OPTIONS: UserInputOption[] = [
  { optionId: "deny", label: "No, keep planning" },
  { optionId: "default", label: "Yes, and manually approve edits" },
  { optionId: "auto", label: "Yes, and switch to Auto" },
];

export function mapClaudePermissionRequest(input: {
  threadId: string;
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  title?: string;
  description?: string;
  displayName?: string;
  blockedPath?: string;
  decisionReason?: string;
  toolUseID?: string;
  suggestions?: readonly PermissionUpdate[];
  /** Session cwd; directory scopes inside it are labelled relative to it. */
  cwd?: string;
}): RuntimeEvent {
  const isExitPlanMode = isExitPlanModeToolName(input.toolName);
  const summary = isExitPlanMode
    ? "Proposed plan"
    : (input.description ?? input.title ?? summarizeToolRequest(input.toolName, input.toolInput));
  const suggestions = (input.suggestions ?? []) as PermissionSuggestion[];
  const details: PermissionRequestDetails = {
    toolName: input.toolName,
    input: input.toolInput,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.blockedPath ? { blockedPath: input.blockedPath } : {}),
    ...(input.decisionReason ? { decisionReason: input.decisionReason } : {}),
    ...(input.toolUseID ? { toolUseID: input.toolUseID } : {}),
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
  return {
    type: "request.opened",
    threadId: input.threadId,
    requestId: input.requestId,
    requestType: classifyRequestType(input.toolName),
    payload: {
      summary,
      details,
      options: isExitPlanMode
        ? EXIT_PLAN_MODE_OPTIONS
        : buildPermissionOptions(suggestions, input.cwd),
    },
  };
}

function buildPermissionOptions(
  suggestions: readonly PermissionSuggestion[],
  cwd: string | undefined,
): UserInputOption[] {
  const options: UserInputOption[] = [{ optionId: "accept", label: "Allow once" }];
  if (suggestions.length > 0) {
    suggestions.forEach((suggestion, index) => {
      const description = formatSuggestionDescription(suggestion, cwd);
      options.push({
        optionId: `${ACCEPT_SUGGESTION_OPTION_PREFIX}${index}`,
        label: formatSuggestionLabel(suggestion, cwd),
        ...(description ? { description } : {}),
      });
    });
  }
  options.push({ optionId: "decline", label: "Deny" });
  return options;
}

function formatSuggestionLabel(s: PermissionSuggestion, cwd: string | undefined): string {
  switch (s.type) {
    case "addRules":
    case "replaceRules":
    case "removeRules": {
      const tools = s.rules.map((r) => r.toolName).filter(Boolean);
      const verb = s.behavior === "allow" ? "Always allow" : s.behavior === "deny" ? "Deny" : "Ask";
      const scope = tools.length > 0 ? tools.join(", ") : "rule";
      return `${verb} ${scope}${destSuffix(s.destination)}`;
    }
    case "setMode":
      return `Switch to ${s.mode} mode${destSuffix(s.destination)}`;
    case "addDirectories":
      return `Allow directories ${formatList(s.directories.map((d) => shortDirectory(d, cwd)))}${destSuffix(s.destination)}`;
    case "removeDirectories":
      return `Block directories ${formatList(s.directories.map((d) => shortDirectory(d, cwd)))}${destSuffix(s.destination)}`;
  }
}

function formatSuggestionDescription(
  s: PermissionSuggestion,
  cwd: string | undefined,
): string | undefined {
  if (s.type === "addRules" || s.type === "replaceRules" || s.type === "removeRules") {
    const patterns = s.rules
      .map((r) => r.ruleContent)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    return patterns.length > 0 ? patterns.join(" · ") : undefined;
  }
  if (s.type === "addDirectories" || s.type === "removeDirectories") {
    // The label shows short paths; keep every full path inspectable.
    const shortened =
      s.directories.length > 3 || s.directories.some((d) => shortDirectory(d, cwd) !== d);
    return shortened ? s.directories.join("\n") : undefined;
  }
  return undefined;
}

/** Project-relative when inside `cwd`; other paths stay absolute because some
 *  clients show only the label, not the description. */
function shortDirectory(directory: string, cwd: string | undefined): string {
  if (!cwd) return directory;
  const path = /^[A-Za-z]:[\\/]|^\\\\/.test(directory) ? win32 : posix;
  const relative = path.relative(cwd, directory);
  if (relative === "") return `.${path.sep}`;
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    return directory;
  return `${relative}${path.sep}`;
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) return "";
  if (values.length <= 3) return values.join(", ");
  return `${values.slice(0, 3).join(", ")} (+${values.length - 3} more)`;
}

function destSuffix(dest: string): string {
  if (dest === "session") return "";
  if (dest === "userSettings") return " (user settings)";
  if (dest === "projectSettings") return " (project)";
  if (dest === "localSettings") return " (local)";
  if (dest === "cliArg") return " (cli arg)";
  return "";
}
