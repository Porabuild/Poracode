/**
 * Map ACP `requestPermission` / `createElicitation` calls to canonical
 * `request.opened` events.
 */

import type { CreateElicitationRequest, RequestPermissionRequest } from "@agentclientprotocol/sdk";
import type {
  CanonicalRequestType,
  PermissionRequestDetails,
  RuntimeEvent,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { readStringField } from "../../fileChangeSummary";
import {
  extractToolCallContentText,
  isAcpExitPlanModeTool,
  isApplyPatchToolName,
  normalizeToolText,
  parseAcpPlanReviewText,
} from "./contentExtraction";
import type { AcpMapperState } from "./state";
import { mapAcpQuestionPermissionRequest } from "../acpQuestionPermissions";

/**
 * Map an ACP `requestPermission` call to a canonical `request.opened` event.
 *
 * The `requestId` you pass here is whatever you used to track the resolver
 * (see `AcpStructuredSession.handlePermissionRequest`); the chat UI later
 * resolves it via `bridge.resolveThreadServerRequest()`.
 */
export function mapAcpPermissionRequest(
  req: RequestPermissionRequest,
  state: AcpMapperState,
  requestId: string,
): RuntimeEvent {
  const questionRequest = mapAcpQuestionPermissionRequest(req, state, requestId);
  if (questionRequest) return questionRequest;

  const toolCall = req.toolCall as {
    toolCallId?: string;
    title?: string;
    kind?: string;
    rawInput?: unknown;
    content?: unknown;
  };
  const rawInput = rawInputWithAuthoritativeMetadata(
    toolCall.rawInput,
    authoritativeToolArgs(state, toolCall.toolCallId),
  );
  // Cross-provider plan review: an ExitPlanMode approval renders through the
  // unified plan-review composer, so emit the same canonical shape Claude
  // produces — "Proposed plan" summary plus `input.plan`/`input.planFilePath`
  // recovered from the ACP text content block.
  if (isAcpExitPlanModeTool(toolCall.title, toolCall.kind)) {
    const planReview = parseAcpPlanReviewText(extractToolCallContentText(toolCall.content));
    return {
      type: "request.opened",
      threadId: state.threadId,
      requestId,
      requestType: "tool_call_approval",
      payload: {
        summary: msg("supervisor.proposedPlan"),
        details: {
          toolName: normalizeToolText(toolCall.title) ?? "ExitPlanMode",
          input: {
            ...(planReview ? { plan: planReview.plan } : {}),
            ...(planReview?.planFilePath ? { planFilePath: planReview.planFilePath } : {}),
          },
        },
        options: mapPermissionOptions(req),
      },
    };
  }

  const command =
    readStringField(rawInput, "command") ?? extractCommandFromApprovalContent(toolCall.content);
  const requestType = classifyApprovalRequestType(toolCall.kind, toolCall.title, command);
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const summary =
    requestType === "command_execution_approval" && command
      ? stripCommandFromApprovalTitle(title, command)
      : (title ?? kind ?? "Approval requested");
  const details =
    requestType === "command_execution_approval" && command
      ? buildCommandPermissionDetails(rawInput, kind, title, command)
      : requestType === "tool_call_approval"
        ? buildToolCallPermissionDetails(rawInput, title, kind)
        : rawInput;
  const options = mapPermissionOptions(req);
  return {
    type: "request.opened",
    threadId: state.threadId,
    requestId,
    requestType,
    payload: {
      summary,
      details,
      options,
    },
  };
}

const AUTHORITATIVE_METADATA_KEYS = ["command", "cwd", "path", "file_path"] as const;

/** Title-derived display text, not a command the tool actually recorded. */
const DISPLAY_PLACEHOLDER_COMMANDS = new Set([
  "running command",
  "shell",
  "execute",
  "exec",
  "run",
  "run command",
  "shell exec",
]);

/**
 * Args already retained for this same tool call. Only `args` counts: a
 * title-derived `payload.command` (often the placeholder "Running command")
 * is not authoritative, and another tool's state is ignored.
 */
function authoritativeToolArgs(
  state: AcpMapperState,
  toolCallId: string | undefined,
): Record<string, unknown> | undefined {
  if (!toolCallId) return undefined;
  const args = state.toolCallItems.get(toolCallId)?.payload.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  return args as Record<string, unknown>;
}

/**
 * Fill command, cwd, path, and file_path only when the request itself omitted
 * them and this tool's retained args already have a real value. Explicit
 * request data wins. Prompts, option labels, and titles are not consulted.
 */
function rawInputWithAuthoritativeMetadata(
  rawInput: unknown,
  args: Record<string, unknown> | undefined,
): unknown {
  if (!args) return rawInput;
  const base =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? { ...(rawInput as Record<string, unknown>) }
      : {};
  let filled = false;
  for (const key of AUTHORITATIVE_METADATA_KEYS) {
    if (readStringField(base, key)) continue;
    const value = readStringField(args, key);
    if (!value) continue;
    if (key === "command" && DISPLAY_PLACEHOLDER_COMMANDS.has(value.toLowerCase())) continue;
    base[key] = value;
    filled = true;
  }
  return filled ? base : rawInput;
}

function mapPermissionOptions(req: RequestPermissionRequest) {
  return req.options.map((opt) => ({
    optionId: opt.optionId,
    label: opt.name,
    description: undefined,
  }));
}

function buildCommandPermissionDetails(
  rawInput: unknown,
  kind: string | undefined,
  title: string | undefined,
  command: string,
): PermissionRequestDetails {
  const cwd = readStringField(rawInput, "cwd");
  return {
    toolName: kind ?? title ?? "execute",
    displayName: "command",
    input: {
      command,
      ...(cwd ? { cwd } : {}),
    },
  };
}

function extractCommandFromApprovalContent(content: unknown): string | undefined {
  const text = extractToolCallContentText(content)?.trim();
  if (!text) return undefined;
  const match = /^Requesting approval to\s+(?:Run|Running):\s*([\s\S]+)$/i.exec(text);
  return normalizeToolText(match?.[1]);
}

function buildToolCallPermissionDetails(
  rawInput: unknown,
  title: string | undefined,
  kind: string | undefined,
): PermissionRequestDetails {
  const toolName = readStringField(rawInput, "tool_name") ?? title ?? kind ?? "tool";
  const toolInput =
    rawInput && typeof rawInput === "object" && "tool_input" in rawInput
      ? (rawInput as { tool_input: unknown }).tool_input
      : rawInput;
  return {
    toolName,
    ...(title && title !== toolName ? { displayName: title } : {}),
    input: toolInput,
  };
}

function stripCommandFromApprovalTitle(title: string | undefined, command: string): string {
  if (!title) return "Run command";
  const colon = title.indexOf(":");
  if (colon < 0) return title;
  const prefix = title.slice(0, colon).trim();
  const suffix = title.slice(colon + 1).trim();
  return suffix === command && prefix.length > 0 ? prefix : title;
}

/**
 * Map an ACP `createElicitation` call to a canonical user-input
 * request. The renderer owns the form/URL presentation; the ACP session owns
 * converting the resolved response back to the SDK response shape.
 */
export function mapAcpElicitationRequest(
  req: CreateElicitationRequest,
  state: AcpMapperState,
  requestId: string,
): RuntimeEvent {
  return {
    type: "request.opened",
    threadId: state.threadId,
    requestId,
    requestType: "tool_user_input",
    payload: {
      summary: req.message,
      details: {
        acpElicitation: {
          ...req,
        },
      },
    },
  };
}

function classifyApprovalRequestType(
  kind: string | undefined,
  title: string | undefined,
  command?: string,
): CanonicalRequestType {
  if (command) return "command_execution_approval";
  const k = (kind ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (k === "execute" || k === "shell" || /^(run|exec|shell)\b/.test(t)) {
    return "command_execution_approval";
  }
  if (
    k === "edit" ||
    isApplyPatchToolName(k) ||
    /\b(edit|patch)\b/.test(t) ||
    isApplyPatchToolName(t)
  )
    return "apply_patch_approval";
  if (k === "write" || /\bwrite\b/.test(t)) return "file_change_approval";
  return "tool_call_approval";
}
