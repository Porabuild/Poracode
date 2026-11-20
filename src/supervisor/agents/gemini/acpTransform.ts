import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path, { join } from "node:path";
import type { RequestPermissionRequest, SessionNotification } from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import { getWslLocationHostFsPath, wslLinuxToHostFsPath } from "@/shared/wsl";
import {
  isAcpHomeScopeLocation,
  isWindowsAbsolutePath,
  resolveAcpReadableHostFsPath,
  resolveAcpResourcePath,
} from "../acp/sessionPaths";
import {
  createAcpSubagentCoordinator,
  normalizeAcpSubagentToolCall,
  plainRecord,
  readNonEmptyString,
  withAcpTopLevelToolCall,
} from "../acp/subagentCoordinator";
import type { AcpSessionUpdateTransform } from "../base";

export const GEMINI_MODE_UPDATE_PREFIX = "[MODE_UPDATE]";

const GEMINI_SUBAGENT_TITLE_RE = /^Running subagent '([^']+)' with inputs:\s*\{([\s\S]*)\}\s*$/u;
const GEMINI_DELEGATE_SUBAGENT_TITLE_RE = /^Delegating to agent '([^']+)'\s*$/u;
const GEMINI_EXIT_PLAN_TITLE_RE = /^Requesting plan approval for:\s*(.+)$/u;
const GEMINI_ENTER_PLAN_TOOL_CALL_RE = /^enter_plan_mode-\d+-\d+$/u;
const GEMINI_EXIT_PLAN_TOOL_CALL_RE = /^exit_plan_mode-\d+-\d+$/u;
const GEMINI_WRITE_TODOS_TOOL_CALL_RE = /^write_todos-\d+-\d+$/u;
const GEMINI_INPUT_KEY_RE = /(?:^|,\s*)([a-zA-Z_][a-zA-Z0-9_]*):\s*/gu;
const GEMINI_READABLE_AGENT_HOME_DIRS = [".gemini"] as const;
const MAX_INLINE_PLAN_BYTES = 512 * 1024;
const TERMINAL_TOOL_STATUSES = new Set(["completed", "failed", "cancelled", "canceled"]);

export interface GeminiAcpTransformOptions {
  projectLocation?: ProjectLocation;
  /** Host-accessible `.gemini` directory for an active profile (when different from `~/.gemini`). */
  profileConfigDir?: string;
}

/**
 * Stateful per-session transform for Gemini CLI's ACP notifications:
 * - Downgrades `[MODE_UPDATE]` control echoes to `session_info_update` before
 *   `acp/session.ts` evaluates `agent_message_chunk` activity so an otherwise-empty
 *   response is caught by `acpEmptyResponseErrorResolver`.
 * - Normalizes Gemini's `LocalSubagentInvocation` (`Running subagent '<name>'
 *   with inputs: { ... }`) and `DelegateInvocation` (`Delegating to agent
 *   '<name>'`) tool calls into canonical `task` subagent items so the UI
 *   renders `SubAgentToolCall` rows instead of generic tool accordions.
 * - Normalizes `enter_plan_mode` / `exit_plan_mode` calls to the cross-provider
 *   `EnterPlanMode` / `ExitPlanMode` names so `PlanProposal` and
 *   `AcpPlanModeToolTracker` work identically to Claude/Kimi.
 * - Normalizes `write_todos` calls that include `rawInput.todos` to `todo_write`
 *   so the canonical mapper updates the Plan dock.
 */
export function createGeminiAcpSessionTransform(
  options: GeminiAcpTransformOptions = {},
): AcpSessionUpdateTransform {
  const subagents = createAcpSubagentCoordinator();
  const enterPlanToolCallIds = new Set<string>();
  const exitPlanPathsByToolCallId = new Map<string, string>();
  const writeTodosToolCallIds = new Set<string>();

  return (notification) => {
    const modeNormalized = transformGeminiNotification(notification);
    if (modeNormalized !== notification) return modeNormalized;

    const update = notification.update as Record<string, unknown>;
    const sessionUpdate = readNonEmptyString(update, "sessionUpdate");
    if (sessionUpdate !== "tool_call" && sessionUpdate !== "tool_call_update") {
      return notification;
    }

    const toolCallId = readNonEmptyString(update, "toolCallId");
    const title = readNonEmptyString(update, "title");
    const kind = readNonEmptyString(update, "kind");
    const status = readNonEmptyString(update, "status")?.toLowerCase();
    const isTerminal = status !== undefined && TERMINAL_TOOL_STATUSES.has(status);

    const subagentMatch = title ? GEMINI_SUBAGENT_TITLE_RE.exec(title) : null;
    const delegateMatch =
      !subagentMatch && title ? GEMINI_DELEGATE_SUBAGENT_TITLE_RE.exec(title) : null;
    const trackedSubagent = toolCallId ? subagents.getCall(toolCallId) : undefined;
    if (toolCallId && (subagentMatch || delegateMatch || trackedSubagent)) {
      const subagentType =
        subagentMatch?.[1]?.trim() ||
        delegateMatch?.[1]?.trim() ||
        trackedSubagent?.subagentType ||
        "agent";
      const parsedInputs = subagentMatch
        ? parseGeminiSubagentInputs(subagentMatch[2] ?? "")
        : plainRecord(update.rawInput);
      const description = pickSubagentDescription(parsedInputs, trackedSubagent?.description);
      const prompt = pickSubagentPrompt(parsedInputs, description ?? trackedSubagent?.prompt);
      const existingRawInput = plainRecord(update.rawInput);
      const mergedInput = { ...existingRawInput, ...parsedInputs };

      subagents.updateCall(toolCallId, {
        rawInput: mergedInput,
        subagentType,
        ...(description ? { description } : {}),
        ...(prompt ? { prompt } : {}),
      });

      const canonicalInput = subagents.canonicalInput(toolCallId, mergedInput);
      const normalized = normalizeAcpSubagentToolCall(notification, {
        rawInput: canonicalInput,
      });
      const normalizedUpdate = normalized.update as Record<string, unknown>;
      const cleanTitle = description ?? trackedSubagent?.description ?? subagentType;
      const withCleanTitle: SessionNotification = {
        ...normalized,
        update: {
          ...normalizedUpdate,
          title: cleanTitle,
        } as SessionNotification["update"],
      };

      if (isTerminal) {
        subagents.forgetCall(toolCallId);
      }
      return sessionUpdate === "tool_call"
        ? withAcpTopLevelToolCall(withCleanTitle)
        : withCleanTitle;
    }

    const hasTodoItems = Array.isArray(plainRecord(update.rawInput).todos);
    const isWriteTodos =
      (toolCallId !== undefined && writeTodosToolCallIds.has(toolCallId)) ||
      (hasTodoItems &&
        (Boolean(toolCallId && GEMINI_WRITE_TODOS_TOOL_CALL_RE.test(toolCallId)) ||
          title === "write_todos" ||
          title === "WriteTodos"));
    if (isWriteTodos) {
      if (toolCallId && !isTerminal) {
        writeTodosToolCallIds.add(toolCallId);
      }
      if (toolCallId && isTerminal) {
        writeTodosToolCallIds.delete(toolCallId);
      }
      return {
        ...notification,
        update: {
          ...update,
          title: "todo_write",
        } as SessionNotification["update"],
      };
    }

    const exitPlanPath =
      (title ? GEMINI_EXIT_PLAN_TITLE_RE.exec(title)?.[1]?.trim() : undefined) ??
      (toolCallId ? exitPlanPathsByToolCallId.get(toolCallId) : undefined);
    const isExitPlan =
      Boolean(exitPlanPath) ||
      Boolean(toolCallId && GEMINI_EXIT_PLAN_TOOL_CALL_RE.test(toolCallId));
    if (isExitPlan) {
      if (toolCallId && exitPlanPath && !isTerminal) {
        exitPlanPathsByToolCallId.set(toolCallId, exitPlanPath);
      }
      if (toolCallId && isTerminal) {
        exitPlanPathsByToolCallId.delete(toolCallId);
      }
      const existingLocations = Array.isArray(update.locations) ? update.locations : undefined;
      const exitFields = buildGeminiExitPlanFields(exitPlanPath, update.rawInput, options);
      return {
        ...notification,
        update: {
          ...update,
          title: "ExitPlanMode",
          rawInput: exitFields.rawInput,
          ...(exitPlanPath && (!existingLocations || existingLocations.length === 0)
            ? { locations: exitFields.locations }
            : {}),
        } as SessionNotification["update"],
      };
    }

    const isEnterPlan =
      (toolCallId !== undefined && enterPlanToolCallIds.has(toolCallId)) ||
      (toolCallId !== undefined && GEMINI_ENTER_PLAN_TOOL_CALL_RE.test(toolCallId)) ||
      (title === "Initiating Plan Mode" && kind === "other");
    if (isEnterPlan) {
      if (toolCallId && !isTerminal) {
        enterPlanToolCallIds.add(toolCallId);
      }
      if (toolCallId && isTerminal) {
        enterPlanToolCallIds.delete(toolCallId);
      }
      const existingRawInput = plainRecord(update.rawInput);
      const reason =
        title && title !== "Initiating Plan Mode" && title !== "EnterPlanMode" ? title : undefined;
      return {
        ...notification,
        update: {
          ...update,
          title: "EnterPlanMode",
          ...(reason
            ? { rawInput: { ...existingRawInput, reason } }
            : Object.keys(existingRawInput).length > 0
              ? { rawInput: existingRawInput }
              : {}),
        } as SessionNotification["update"],
      };
    }

    return notification;
  };
}

/**
 * Normalize Gemini CLI's `requestPermission` payload for `exit_plan_mode` into
 * the shared `ExitPlanMode` approval contract consumed by `mapAcpPermissionRequest`.
 */
export function normalizeGeminiPermissionRequest(
  request: RequestPermissionRequest,
  options: GeminiAcpTransformOptions = {},
): RequestPermissionRequest {
  const toolCall = request.toolCall;
  const title = typeof toolCall?.title === "string" ? toolCall.title.trim() : undefined;
  const titleMatch = title ? GEMINI_EXIT_PLAN_TITLE_RE.exec(title) : null;
  const toolCallId = typeof toolCall?.toolCallId === "string" ? toolCall.toolCallId : undefined;
  const isExitPlan =
    Boolean(titleMatch) || Boolean(toolCallId && GEMINI_EXIT_PLAN_TOOL_CALL_RE.test(toolCallId));
  if (!isExitPlan) return request;

  const planFilePath =
    titleMatch?.[1]?.trim() ||
    (Array.isArray(toolCall.locations)
      ? toolCall.locations.find(
          (loc): loc is { path: string } =>
            typeof loc?.path === "string" && loc.path.trim().length > 0,
        )?.path
      : undefined);
  const { planText, rawInput, locations } = buildGeminiExitPlanFields(
    planFilePath,
    toolCall.rawInput,
    options,
  );

  const existingContent = Array.isArray(toolCall.content) ? toolCall.content : [];
  const reviewText =
    planFilePath && planText
      ? `Plan saved to: ${planFilePath}\n\n${planText}`
      : (planText ?? (planFilePath ? `Plan saved to: ${planFilePath}` : undefined));
  const content =
    reviewText !== undefined
      ? [
          { type: "content" as const, content: { type: "text" as const, text: reviewText } },
          ...existingContent,
        ]
      : existingContent;

  return {
    ...request,
    toolCall: {
      ...toolCall,
      title: "ExitPlanMode",
      ...(planFilePath ? { rawInput, locations } : {}),
      content,
    },
  };
}

function buildGeminiExitPlanFields(
  planFilePath: string | undefined,
  existingRawInputValue: unknown,
  options: GeminiAcpTransformOptions,
): {
  planText: string | undefined;
  rawInput: Record<string, unknown>;
  locations: Array<{ path: string }>;
} {
  const planText = planFilePath ? readGeminiPlanMarkdown(planFilePath, options) : undefined;
  return {
    planText,
    rawInput: {
      ...plainRecord(existingRawInputValue),
      ...(planFilePath ? { planFilePath } : {}),
      ...(planText ? { plan: planText } : {}),
    },
    locations: planFilePath ? [{ path: planFilePath }] : [],
  };
}

function transformGeminiNotification(notification: SessionNotification): SessionNotification {
  const update = notification.update;
  if (
    update.sessionUpdate === "agent_message_chunk" &&
    update.content.type === "text" &&
    typeof update.content.text === "string" &&
    update.content.text.trimStart().startsWith(GEMINI_MODE_UPDATE_PREFIX)
  ) {
    return {
      ...notification,
      update: {
        sessionUpdate: "session_info_update",
      },
    };
  }
  return notification;
}

function parseGeminiSubagentInputs(body: string): Record<string, unknown> {
  const trimmed = body.trim();
  if (!trimmed) return {};
  GEMINI_INPUT_KEY_RE.lastIndex = 0;
  const keys: Array<{ key: string; start: number; valueStart: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = GEMINI_INPUT_KEY_RE.exec(trimmed)) !== null) {
    keys.push({
      key: match[1]!,
      start: match.index,
      valueStart: GEMINI_INPUT_KEY_RE.lastIndex,
    });
  }
  if (keys.length === 0) return { prompt: trimmed };

  const parsed: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const entry = keys[i]!;
    const nextStart = i + 1 < keys.length ? keys[i + 1]!.start : trimmed.length;
    const rawValue = trimmed.slice(entry.valueStart, nextStart).trim();
    if (rawValue.length > 0) parsed[entry.key] = rawValue;
  }
  return parsed;
}

function pickSubagentDescription(
  inputs: Record<string, unknown>,
  fallback: string | undefined,
): string | undefined {
  for (const key of ["description", "objective", "query", "task", "prompt", "request", "topic"]) {
    const value = readNonEmptyString(inputs, key);
    if (value) return value;
  }
  return fallback;
}

function pickSubagentPrompt(
  inputs: Record<string, unknown>,
  fallback: string | undefined,
): string | undefined {
  for (const key of ["prompt", "objective", "query", "task", "request", "description"]) {
    const value = readNonEmptyString(inputs, key);
    if (value) return value;
  }
  return fallback;
}

function isWithinCanonicalRoot(candidatePath: string, approvedRoots: readonly string[]): boolean {
  let canonicalTarget: string;
  try {
    canonicalTarget = realpathSync(candidatePath);
  } catch {
    return false;
  }
  for (const root of approvedRoots) {
    try {
      const canonicalRoot = realpathSync(root);
      const rel = path.relative(canonicalRoot, canonicalTarget);
      if (
        rel === "" ||
        (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function resolveGeminiPlanCandidateHostPath(
  planPath: string,
  options: GeminiAcpTransformOptions,
): { hostPath: string; approvedRoots: string[]; skipContainmentCheck: boolean } | undefined {
  const approvedRoots: string[] = [join(homedir(), ".gemini")];
  if (options.profileConfigDir) {
    approvedRoots.push(options.profileConfigDir);
  }

  const location = options.projectLocation;
  if (!location) {
    return { hostPath: planPath, approvedRoots, skipContainmentCheck: false };
  }

  const projectHostRoot =
    location.kind === "wsl" ? getWslLocationHostFsPath(location) : location.path;
  approvedRoots.unshift(projectHostRoot);

  if (location.kind === "wsl") {
    const wslUserHomeMatch = /^(\/(?:home\/[^/]+|Users\/[^/]+|root))(?:\/|$)/.exec(
      location.linuxPath,
    );
    if (wslUserHomeMatch?.[1]) {
      approvedRoots.push(wslLinuxToHostFsPath(location.distro, `${wslUserHomeMatch[1]}/.gemini`));
    }
  }

  const skipContainmentCheck = isAcpHomeScopeLocation(location);

  try {
    const hostPath = resolveAcpReadableHostFsPath(
      location,
      planPath,
      GEMINI_READABLE_AGENT_HOME_DIRS,
    );
    return { hostPath, approvedRoots, skipContainmentCheck };
  } catch {
    if (!options.profileConfigDir) return undefined;
    const resourcePath = resolveAcpResourcePath(location, planPath);
    const hostPath =
      location.kind === "wsl" && !isWindowsAbsolutePath(resourcePath)
        ? wslLinuxToHostFsPath(location.distro, resourcePath)
        : resourcePath;
    return { hostPath, approvedRoots, skipContainmentCheck };
  }
}

function readGeminiPlanMarkdown(
  planPath: string,
  options: GeminiAcpTransformOptions,
): string | undefined {
  try {
    const resolved = resolveGeminiPlanCandidateHostPath(planPath, options);
    if (!resolved) return undefined;
    const { hostPath, approvedRoots, skipContainmentCheck } = resolved;
    if (!skipContainmentCheck && !isWithinCanonicalRoot(hostPath, approvedRoots)) {
      return undefined;
    }
    const stats = statSync(hostPath);
    if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_INLINE_PLAN_BYTES) {
      return undefined;
    }
    const content = readFileSync(hostPath, "utf8").trim();
    return content.length > 0 ? content : undefined;
  } catch {
    return undefined;
  }
}
