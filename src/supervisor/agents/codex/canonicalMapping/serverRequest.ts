/**
 * Codex app-server JSON-RPC request ↔ canonical `request.opened` mapping.
 *
 * Approval requests (`item/.../requestApproval`) and form requests
 * (`mcpServer/elicitation/request`, `item/tool/requestUserInput`) are JSON-RPC
 * requests, not notifications. {@link mapCodexServerRequest} maps them to
 * canonical `request.opened` events; {@link translateCodexCanonicalResponse}
 * is the inverse for the renderer's `{ optionId }` response.
 */

import type {
  CanonicalRequestType,
  PermissionRequestDetails,
  RuntimeEvent,
  UserInputOption,
} from "@/shared/contracts";
import { readStringField } from "../../fileChangeSummary";
import type { CommandExecutionApprovalDecision, ToolRequestUserInputParams } from "../protocol";

type StringCommandExecutionApprovalDecision = Extract<CommandExecutionApprovalDecision, string>;

const DEFAULT_APPROVAL_DECISIONS = [
  "accept",
  "acceptForSession",
  "decline",
  "cancel",
] as const satisfies readonly StringCommandExecutionApprovalDecision[];

const CODEX_APPROVAL_METHODS = new Set([
  // Legacy-only: this request is absent from the 0.144.5 protocol.
  "item/fileRead/requestApproval",
  "item/fileChange/requestApproval",
  "applyPatchApproval",
  "execCommandApproval",
  // Legacy-only: this request is absent from the 0.144.5 protocol.
  "item/tool/requestApproval",
  "item/commandExecution/requestApproval",
  "item/permissions/requestApproval",
]);

const CODEX_FORM_METHODS = new Set(["mcpServer/elicitation/request", "item/tool/requestUserInput"]);

function decisionLabel(decision: StringCommandExecutionApprovalDecision): string {
  switch (decision) {
    case "accept":
      return "Allow";
    case "acceptForSession":
      return "Allow always";
    case "decline":
    case "cancel":
      return "Deny";
  }
}

function codexDecisionOptions(
  decisions: readonly CommandExecutionApprovalDecision[],
): UserInputOption[] {
  const stringDecisions = decisions.filter(
    (decision): decision is StringCommandExecutionApprovalDecision => typeof decision === "string",
  );
  const hasDecline = stringDecisions.includes("decline");
  return stringDecisions
    .filter((decision) => decision !== "cancel" || !hasDecline)
    .map((decision) => ({
      optionId: decision,
      label: decisionLabel(decision),
    }));
}

function readAvailableDecisions(
  params: Record<string, unknown> | undefined,
  fallback: readonly StringCommandExecutionApprovalDecision[],
): CommandExecutionApprovalDecision[] {
  return Array.isArray(params?.availableDecisions)
    ? (params.availableDecisions as unknown[]).filter(isCommandExecutionApprovalDecision)
    : [...fallback];
}

function isCommandExecutionApprovalDecision(
  value: unknown,
): value is CommandExecutionApprovalDecision {
  if (typeof value === "string") {
    return DEFAULT_APPROVAL_DECISIONS.includes(value as StringCommandExecutionApprovalDecision);
  }
  return (
    value !== null &&
    typeof value === "object" &&
    ("acceptWithExecpolicyAmendment" in value || "applyNetworkPolicyAmendment" in value)
  );
}

function normalizeCodexUserInputQuestions(
  questions: ToolRequestUserInputParams["questions"],
): unknown[] {
  return questions.map((question) => {
    if (!question || typeof question !== "object") return question;
    const record = question as Record<string, unknown>;
    if (!Array.isArray(record.options)) return question;
    return {
      ...record,
      options: record.options.map((option) => {
        if (!option || typeof option !== "object") return option;
        const optionRecord = option as Record<string, unknown>;
        const label =
          typeof optionRecord.label === "string" && optionRecord.label.length > 0
            ? optionRecord.label
            : typeof optionRecord.optionId === "string" && optionRecord.optionId.length > 0
              ? optionRecord.optionId
              : undefined;
        return label ? { ...optionRecord, optionId: label, label } : option;
      }),
    };
  });
}

function codexPermissionDetails(input: {
  toolName: string;
  displayName?: string;
  toolInput?: unknown;
}): PermissionRequestDetails {
  return {
    toolName: input.toolName,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.toolInput !== undefined ? { input: input.toolInput } : {}),
  };
}

/**
 * Map a Codex app-server JSON-RPC request to a canonical `request.opened`
 * event. Returns `undefined` for methods that aren't representable as a
 * canonical approval (e.g., MCP elicitation forms); callers should fall back
 * to the legacy server-request bus for those.
 *
 * The translation from the renderer's `{ optionId }` response back into the
 * Codex-native response shape is the inverse of this mapping and lives in
 * {@link translateCodexCanonicalResponse}.
 */
export function mapCodexServerRequest(
  threadId: string,
  requestId: string,
  method: string,
  params: Record<string, unknown> | undefined,
): RuntimeEvent | undefined {
  if (method === "mcpServer/elicitation/request") {
    const message = readStringField(params, "message");
    const serverName = readStringField(params, "serverName");
    const mode = readStringField(params, "mode");
    if (!message || !serverName || (mode !== "form" && mode !== "url")) {
      return undefined;
    }
    return {
      type: "request.opened",
      threadId,
      requestId,
      requestType: "tool_user_input" satisfies CanonicalRequestType,
      payload: {
        summary: message,
        // The renderer detects MCP elicitation by the `mcpElicitation` marker on
        // `details` and renders a form. The form response shape is the
        // MCP-native `{ action, content, _meta? }`, which the supervisor
        // passes through to the agent untranslated.
        details: { mcpElicitation: params },
      },
    };
  }

  if (method === "item/tool/requestUserInput") {
    const questions = Array.isArray(params?.questions)
      ? normalizeCodexUserInputQuestions(
          params.questions as ToolRequestUserInputParams["questions"],
        )
      : [];
    if (questions.length === 0) return undefined;
    return {
      type: "request.opened",
      threadId,
      requestId,
      requestType: "tool_user_input" satisfies CanonicalRequestType,
      payload: {
        summary: "Input requested",
        // Carry the original questions list — the renderer detects this by the
        // `codexUserInput` marker and renders a multi-question form. The
        // response shape is the Codex-native `{ answers: { [id]: { answers: [value] } } }`,
        // which the supervisor passes through untranslated.
        details: { codexUserInput: { questions } },
      },
    };
  }

  if (!CODEX_APPROVAL_METHODS.has(method)) return undefined;

  const reason = readStringField(params, "reason");

  if (method === "item/permissions/requestApproval") {
    return {
      type: "request.opened",
      threadId,
      requestId,
      requestType: "command_execution_approval" satisfies CanonicalRequestType,
      payload: {
        summary: reason ?? "Permissions requested",
        details: codexPermissionDetails({
          toolName: "permissions",
          displayName: "Permissions",
          toolInput: { permissions: params?.permissions },
        }),
        options: [
          { optionId: "turn", label: "Allow this turn" },
          { optionId: "session", label: "Allow for session" },
          { optionId: "deny", label: "Deny" },
        ] satisfies UserInputOption[],
      },
    };
  }

  if (method === "item/commandExecution/requestApproval") {
    const command = readStringField(params, "command") ?? "command";
    const decisions = readAvailableDecisions(params, DEFAULT_APPROVAL_DECISIONS);
    return {
      type: "request.opened",
      threadId,
      requestId,
      requestType: "command_execution_approval" satisfies CanonicalRequestType,
      payload: {
        summary: reason ?? "Run command",
        details: codexPermissionDetails({
          toolName: "command_execution",
          displayName: "Run",
          toolInput: {
            command,
            ...(readStringField(params, "cwd") ? { cwd: readStringField(params, "cwd") } : {}),
          },
        }),
        options: codexDecisionOptions(decisions),
      },
    };
  }

  if (method === "execCommandApproval") {
    const command = Array.isArray(params?.command)
      ? (params.command as unknown[]).filter((part): part is string => typeof part === "string")
      : [];
    return {
      type: "request.opened",
      threadId,
      requestId,
      requestType: "command_execution_approval" satisfies CanonicalRequestType,
      payload: {
        summary: reason ?? "Run command",
        details: codexPermissionDetails({
          toolName: "command_execution",
          displayName: "Run",
          toolInput: {
            command: command.length > 0 ? command.join(" ") : "command",
            ...(readStringField(params, "cwd") ? { cwd: readStringField(params, "cwd") } : {}),
          },
        }),
        options: codexDecisionOptions(DEFAULT_APPROVAL_DECISIONS),
      },
    };
  }

  if (method === "item/fileRead/requestApproval") {
    return {
      type: "request.opened",
      threadId,
      requestId,
      requestType: "file_read_approval" satisfies CanonicalRequestType,
      payload: {
        summary: reason ?? "Read file",
        details: codexPermissionDetails({
          toolName: "file_read",
          displayName: "Read file",
          toolInput: {
            ...(readStringField(params, "path") ? { path: readStringField(params, "path") } : {}),
            ...(readStringField(params, "cwd") ? { cwd: readStringField(params, "cwd") } : {}),
          },
        }),
        options: codexDecisionOptions(["accept", "decline", "cancel"]),
      },
    };
  }

  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    const summary = reason ?? "File changes need approval";
    const decisions = readAvailableDecisions(params, DEFAULT_APPROVAL_DECISIONS);
    return {
      type: "request.opened",
      threadId,
      requestId,
      requestType: "file_change_approval" satisfies CanonicalRequestType,
      payload: {
        summary,
        details: codexPermissionDetails({
          toolName: "file_change",
          displayName: "Edit files",
          toolInput: {
            ...(readStringField(params, "command")
              ? { command: readStringField(params, "command") }
              : {}),
            ...(readStringField(params, "cwd") ? { cwd: readStringField(params, "cwd") } : {}),
            ...(readStringField(params, "grantRoot")
              ? { grantRoot: readStringField(params, "grantRoot") }
              : {}),
            ...(params?.fileChanges !== undefined ? { fileChanges: params.fileChanges } : {}),
          },
        }),
        options: codexDecisionOptions(decisions),
      },
    };
  }

  // item/tool/requestApproval
  const approvalToolName = readStringField(params, "name");
  return {
    type: "request.opened",
    threadId,
    requestId,
    requestType: "command_execution_approval" satisfies CanonicalRequestType,
    payload: {
      summary:
        reason ?? (approvalToolName ? `${approvalToolName} needs approval` : "Tool requested"),
      details: codexPermissionDetails({
        toolName: approvalToolName ?? "tool",
        ...(approvalToolName ? { displayName: approvalToolName } : {}),
        toolInput: params?.input,
      }),
      options: codexDecisionOptions(DEFAULT_APPROVAL_DECISIONS),
    },
  };
}

/**
 * Inverse of {@link mapCodexServerRequest}: takes the renderer's canonical
 * `{ optionId }` response and produces the Codex-native JSON-RPC result shape.
 */
export function translateCodexCanonicalResponse(
  method: string,
  params: Record<string, unknown> | undefined,
  response: unknown,
): unknown {
  // Form-mode requests (MCP elicitation) carry their native response shape
  // (`{ action, content, _meta? }`) straight through — there is no
  // `{ optionId }` envelope to unwrap.
  if (CODEX_FORM_METHODS.has(method)) return response;

  const optionId = readStringField(response, "optionId");
  if (!optionId) return response;

  if (method === "item/permissions/requestApproval") {
    if (optionId === "deny") {
      return { permissions: {}, scope: "turn" };
    }
    return {
      permissions: params?.permissions ?? {},
      scope: optionId === "session" ? "session" : "turn",
    };
  }

  // All other Codex approval methods take `{ decision }`.
  return { decision: optionId };
}
