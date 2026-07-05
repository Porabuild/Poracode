/**
 * OpenCode permission request → canonical request mapping.
 */

import type {
  CanonicalRequestType,
  PermissionRequestDetails,
  UserInputOption,
} from "@/shared/contracts";
import type { PermissionRequest } from "@opencode-ai/sdk/v2";
import { readStringMetadata } from "./readers";

export function classifyPermissionRequestType(req: PermissionRequest): CanonicalRequestType {
  switch (req.permission) {
    case "bash":
      return "command_execution_approval";
    case "edit":
      return "file_change_approval";
    case "read":
      return "file_change_approval";
    default:
      return "command_execution_approval";
  }
}

export function permissionRequestPayload(req: PermissionRequest): {
  summary: string;
  details: PermissionRequestDetails;
  options: UserInputOption[];
} {
  const target = readPermissionTarget(req);
  const targetKind = classifyPermissionTargetKind(req.permission);
  const options: UserInputOption[] = [
    { optionId: "reject", label: "Deny" },
    { optionId: "once", label: "Allow" },
  ];
  if (Array.isArray(req.always) && req.always.length > 0) {
    options.push({ optionId: "always", label: "Allow always" });
  }
  return {
    summary: "Permission required",
    details: {
      toolName: req.permission,
      displayName: "target",
      decisionReason: permissionDescription(req.permission),
      input: targetKind === "path" ? { path: target } : { command: target },
    },
    options,
  };
}

export function readPermissionTarget(req: PermissionRequest): string {
  const metadata = req.metadata && typeof req.metadata === "object" ? req.metadata : undefined;
  const metadataTarget = metadata
    ? (readStringMetadata(metadata, "description") ?? readStringMetadata(metadata, "target"))
    : undefined;
  return metadataTarget ?? req.patterns?.find((pattern) => pattern.length > 0) ?? req.permission;
}

export function classifyPermissionTargetKind(permission: string): "command" | "path" {
  return permission === "read" || permission === "edit" ? "path" : "command";
}

export function permissionDescription(permission: string): string {
  switch (permission) {
    case "bash":
      return "OpenCode wants to run a command.";
    case "read":
      return "OpenCode wants to read a file.";
    case "edit":
      return "OpenCode wants to edit files.";
    case "task":
      return "OpenCode wants to start a subagent.";
    default:
      return `OpenCode wants to use ${permission}.`;
  }
}

export function permissionRequestId(id: string): string {
  return `opencode-perm-${id}`;
}
