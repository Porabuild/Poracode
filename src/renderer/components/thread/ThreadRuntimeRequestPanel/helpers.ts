import { msg } from "@lingui/core/macro";
import {
  asPermissionRequestDetails,
  type CanonicalRequestType,
  type RequestOutcome,
  type UserInputOption,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";

/**
 * Default approve/deny options used when the request carries none. The
 * `optionId`s are the stable identifiers that drive selection + the
 * negative-option detection (`isNegativeOption` matches on `optionId`), so only
 * the display `label` is localized — and built fresh per call so it tracks the
 * active locale.
 */
export function getDefaultApprovalOptions(): UserInputOption[] {
  return [
    { optionId: "allow", label: i18n._(msg`Allow`) },
    { optionId: "deny", label: i18n._(msg`Deny`) },
  ];
}

export const NEGATIVE_OPTION_PATTERN = /(deny|denied|decline|reject|abort|cancel)/i;

export function isNegativeOption(option: UserInputOption): boolean {
  return (
    NEGATIVE_OPTION_PATTERN.test(option.optionId) || NEGATIVE_OPTION_PATTERN.test(option.label)
  );
}

/**
 * Plan-review options that ask for another planning round instead of approving.
 * These read as positive to {@link NEGATIVE_OPTION_PATTERN} — Kimi Code offers
 * `plan_approve` / `plan_revise` / `plan_reject_and_exit` — so without this a
 * "Revise" selection was treated as an approval and left plan mode in the
 * composer while the agent was still planning ("Plan mode remains active").
 */
const PLAN_KEEP_PLANNING_PATTERN = /(revise|revision|keep[\s_-]?planning)/i;

/**
 * True when a plan-review selection approves the plan, i.e. the thread really
 * leaves plan mode. Revise/keep-planning and every negative option do not.
 */
export function isPlanApprovalAccepted(optionId: string): boolean {
  return !NEGATIVE_OPTION_PATTERN.test(optionId) && !PLAN_KEEP_PLANNING_PATTERN.test(optionId);
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
  const options = request.payload.options ?? getDefaultApprovalOptions();
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
