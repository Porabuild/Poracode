import {
  asPermissionRequestDetails,
  type CanonicalRequestType,
  type RequestOutcome,
  type UserInputOption,
} from "@/shared/contracts";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";

export const DEFAULT_APPROVAL_OPTIONS: UserInputOption[] = [
  { optionId: "allow", label: "Allow" },
  { optionId: "deny", label: "Deny" },
];

export const NEGATIVE_OPTION_PATTERN = /(deny|denied|decline|reject|abort|cancel)/i;

export function isNegativeOption(option: UserInputOption): boolean {
  return (
    NEGATIVE_OPTION_PATTERN.test(option.optionId) || NEGATIVE_OPTION_PATTERN.test(option.label)
  );
}

export function isPlanApprovalRequest(request: OpenRuntimeRequest): boolean {
  const details = asPermissionRequestDetails(request.payload.details);
  if (!details) return false;
  return details.toolName === "ExitPlanMode" || details.toolName === "exit_plan_mode";
}

const APPROVAL_REQUEST_TYPES = new Set<CanonicalRequestType>([
  "command_execution_approval",
  "file_read_approval",
  "file_change_approval",
  "apply_patch_approval",
  "tool_call_approval",
]);

export function getApprovalDenyOption(request: OpenRuntimeRequest): UserInputOption | undefined {
  if (!APPROVAL_REQUEST_TYPES.has(request.requestType)) return undefined;
  if (isPlanApprovalRequest(request)) return undefined;
  const options = request.payload.options ?? DEFAULT_APPROVAL_OPTIONS;
  return options.find(isNegativeOption);
}

export function outcomeForSelection(
  requestType: CanonicalRequestType,
  optionId: string,
  forceApproval = false,
): RequestOutcome {
  if (requestType === "tool_user_input" && !forceApproval) return "answered";
  return NEGATIVE_OPTION_PATTERN.test(optionId) ? "declined" : "accepted";
}

export type OpenCodePermissionDetails = {
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown> | undefined;
};

export function asOpenCodePermissionDetails(value: unknown): OpenCodePermissionDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.permission !== "string") return undefined;
  const patterns = Array.isArray(obj.patterns)
    ? obj.patterns.filter((p): p is string => typeof p === "string")
    : [];
  const metadata =
    obj.metadata && typeof obj.metadata === "object"
      ? (obj.metadata as Record<string, unknown>)
      : undefined;
  return { permission: obj.permission, patterns, metadata };
}

export function formatInputSubject(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  if (typeof obj.command === "string") return obj.command;
  if (typeof obj.file_path === "string") return obj.file_path;
  if (typeof obj.path === "string") return obj.path;
  if (typeof obj.url === "string") return obj.url;
  return undefined;
}

export function readInputString(input: unknown, ...keys: string[]): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function formatRawDetails(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
