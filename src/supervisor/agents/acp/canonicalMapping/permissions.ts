/**
 * Map ACP `requestPermission` / `unstable_createElicitation` calls to canonical
 * `request.opened` events.
 */

import type { CreateElicitationRequest, RequestPermissionRequest } from "@agentclientprotocol/sdk";
import type {
  CanonicalRequestType,
  PermissionRequestDetails,
  RuntimeEvent,
} from "@/shared/contracts";
import { readStringField } from "../../fileChangeSummary";
import {
  extractToolCallContentText,
  isApplyPatchToolName,
  normalizeToolText,
} from "./contentExtraction";
import type { AcpMapperState } from "./state";

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
  const toolCall = req.toolCall as {
    title?: string;
    kind?: string;
    rawInput?: unknown;
    content?: unknown;
  };
  const command =
    readStringField(toolCall.rawInput, "command") ??
    extractCommandFromApprovalContent(toolCall.content);
  const requestType = classifyApprovalRequestType(toolCall.kind, toolCall.title, command);
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const summary =
    requestType === "command_execution_approval" && command
      ? stripCommandFromApprovalTitle(title, command)
      : (title ?? kind ?? "Approval requested");
  const details =
    requestType === "command_execution_approval" && command
      ? buildCommandPermissionDetails(toolCall.rawInput, kind, title, command)
      : requestType === "tool_call_approval"
        ? buildToolCallPermissionDetails(toolCall.rawInput, title, kind)
        : toolCall.rawInput;
  const options = req.options.map((opt) => ({
    optionId: opt.optionId,
    label: opt.name,
    description: undefined,
  }));
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
 * Map an ACP `unstable_createElicitation` call to a canonical user-input
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
