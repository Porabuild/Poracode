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
      options: isExitPlanMode ? EXIT_PLAN_MODE_OPTIONS : buildPermissionOptions(suggestions),
    },
  };
}

function buildPermissionOptions(suggestions: readonly PermissionSuggestion[]): UserInputOption[] {
  const options: UserInputOption[] = [{ optionId: "accept", label: "Allow once" }];
  if (suggestions.length === 0) {
    options.push({ optionId: "acceptForSession", label: "Always allow" });
  } else {
    suggestions.forEach((suggestion, index) => {
      options.push({
        optionId: `${ACCEPT_SUGGESTION_OPTION_PREFIX}${index}`,
        label: formatSuggestionLabel(suggestion),
        ...(formatSuggestionDescription(suggestion)
          ? { description: formatSuggestionDescription(suggestion) as string }
          : {}),
      });
    });
  }
  options.push({ optionId: "decline", label: "Deny" });
  return options;
}

function formatSuggestionLabel(s: PermissionSuggestion): string {
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
      return `Allow directories ${formatList(s.directories)}${destSuffix(s.destination)}`;
    case "removeDirectories":
      return `Block directories ${formatList(s.directories)}${destSuffix(s.destination)}`;
  }
}

function formatSuggestionDescription(s: PermissionSuggestion): string | undefined {
  if (s.type === "addRules" || s.type === "replaceRules" || s.type === "removeRules") {
    const patterns = s.rules
      .map((r) => r.ruleContent)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    return patterns.length > 0 ? patterns.join(" · ") : undefined;
  }
  return undefined;
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
