/**
 * OpenCode 2 server-request → canonical request payload mapping
 * (`permission.asked` approvals and `form.created` user input), mirroring
 * OpenCode 1's `canonicalMapping/permissions.ts` + `questions.ts`.
 */

import type { CanonicalRequestType } from "@/shared/contracts";
import { readOpenCode2String } from "./readers";

export function openCode2PermissionRequestId(id: string): string {
  return `opencode2-perm-${id}`;
}

export function openCode2FormRequestId(id: string): string {
  return `opencode2-form-${id}`;
}

export function classifyOpenCode2PermissionType(action: string): CanonicalRequestType {
  switch (action) {
    case "bash":
    case "shell":
      return "command_execution_approval";
    case "read":
      return "file_read_approval";
    case "edit":
      return "file_change_approval";
    default:
      return "tool_call_approval";
  }
}

export function openCode2PermissionPayload(req: {
  action: string;
  resources: readonly string[];
  save?: readonly string[];
  metadata?: Record<string, unknown>;
}): { summary: string; details: unknown; options: Array<{ optionId: string; label: string }> } {
  const firstResource = req.resources.find((resource) => resource.length > 0);
  // V2's `resources` ARE the approved targets (command line / path patterns);
  // metadata only describes them, so the resource wins the subject slot.
  const target = firstResource ?? readOpenCode2String(req.metadata, "target") ?? undefined;
  const targetKind = req.action === "read" || req.action === "edit" ? "path" : "command";
  const extraCount = req.resources.length - (firstResource ? 1 : 0);
  return {
    // Supervisor-originated strings can't go through Lingui macros (no
    // catalogs outside the renderer); extra targets ride along in details.
    summary: "Permission required",
    details: {
      toolName: req.action,
      displayName: ["bash", "shell"].includes(req.action) ? "command" : req.action,
      decisionReason: openCode2PermissionDecisionReason(req.action),
      ...(target
        ? {
            input:
              targetKind === "path"
                ? { path: target, ...(extraCount > 0 ? { paths: [...req.resources] } : {}) }
                : { command: target, ...(extraCount > 0 ? { commands: [...req.resources] } : {}) },
          }
        : {}),
    },
    options: [
      { optionId: "reject", label: "Deny" },
      { optionId: "once", label: "Allow" },
      // `save` lists the patterns the server persists for "always" — only
      // offer the option when the server says it can be saved.
      ...((req.save?.length ?? 0) > 0 ? [{ optionId: "always", label: "Allow always" }] : []),
    ],
  };
}

function openCode2PermissionDecisionReason(action: string): string {
  switch (action) {
    case "bash":
    case "shell":
      return "OpenCode 2 wants to run a command.";
    case "read":
      return "OpenCode 2 wants to read a file.";
    case "edit":
      return "OpenCode 2 wants to edit files.";
    case "task":
    case "subagent":
      return "OpenCode 2 wants to start a subagent.";
    default:
      return `OpenCode 2 wants to use ${action}.`;
  }
}

export { openCode2FormPayload } from "./forms";
