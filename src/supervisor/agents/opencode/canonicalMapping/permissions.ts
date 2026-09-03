/**
 * OpenCode permission request → canonical request mapping.
 */

import type {
  CanonicalRequestType,
  PermissionRequestDetails,
  UserInputOption,
} from "@/shared/contracts";
import type { PermissionRequest } from "../legacySdk";
import { readStringMetadata } from "./readers";

/** Minimal structural view of OpenCode's `permission.v2.asked` properties. */
export interface PermissionV2RequestShape {
  id: string;
  sessionID: string;
  action: string;
  resources: Array<string>;
  save?: Array<string>;
  metadata?: Record<string, unknown>;
}

export function classifyPermissionRequestType(req: PermissionRequest): CanonicalRequestType {
  return classifyPermissionActionType(req.permission);
}

export function classifyPermissionActionType(action: string): CanonicalRequestType {
  switch (action) {
    case "bash":
      return "command_execution_approval";
    case "read":
      return "file_read_approval";
    case "edit":
      return "file_change_approval";
    default:
      return "tool_call_approval";
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
      displayName: permissionDisplayName(req.permission),
      decisionReason: permissionDescription(req.permission),
      ...(target ? { input: targetKind === "path" ? { path: target } : { command: target } } : {}),
    },
    options,
  };
}

export function readPermissionTarget(req: PermissionRequest): string | undefined {
  const metadata = req.metadata && typeof req.metadata === "object" ? req.metadata : undefined;
  const metadataTarget = metadata
    ? (readStringMetadata(metadata, "description") ?? readStringMetadata(metadata, "target"))
    : undefined;
  return metadataTarget ?? req.patterns?.find((pattern) => pattern.length > 0);
}

export function classifyPermissionTargetKind(permission: string): "command" | "path" {
  return permission === "read" || permission === "edit" ? "path" : "command";
}

function permissionDisplayName(permission: string): string {
  return permission === "bash" ? "command" : permission;
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

export function permissionV2RequestPayload(req: PermissionV2RequestShape): {
  summary: string;
  details: PermissionRequestDetails;
  options: UserInputOption[];
} {
  const firstResource = req.resources.find((resource) => resource.length > 0);
  const target =
    (req.metadata
      ? (readStringMetadata(req.metadata, "description") ??
        readStringMetadata(req.metadata, "target"))
      : undefined) ?? firstResource;
  const targetKind = classifyPermissionTargetKind(req.action);
  const options: UserInputOption[] = [
    { optionId: "reject", label: "Deny" },
    { optionId: "once", label: "Allow" },
  ];
  // `save` lists the patterns the server will persist when the user picks
  // "always" — only offer it when the server says it can be saved.
  if (Array.isArray(req.save) && req.save.length > 0) {
    options.push({ optionId: "always", label: "Allow always" });
  }
  const extraCount = req.resources.length - (firstResource ? 1 : 0);
  return {
    // Keep the v1 summary verbatim — supervisor-originated strings can't go
    // through Lingui macros (no catalogs outside the renderer); the extra
    // targets ride along in details.input instead.
    summary: "Permission required",
    details: {
      toolName: req.action,
      displayName: permissionDisplayName(req.action),
      decisionReason: permissionDescription(req.action),
      ...(target
        ? {
            input:
              targetKind === "path"
                ? { path: target, ...(extraCount > 0 ? { paths: req.resources } : {}) }
                : { command: target, ...(extraCount > 0 ? { commands: req.resources } : {}) },
          }
        : {}),
    },
    options,
  };
}

export function permissionV2RequestId(id: string): string {
  return `opencode-permv2-${id}`;
}
