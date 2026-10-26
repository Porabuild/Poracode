import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";
import { findApprovalDenyOption } from "@/shared/runtimeRequestForms";
import type { UserInputOption } from "@/shared/contracts";

export {
  asOpenCodePermissionDetails,
  formatInputSubject,
  formatRawDetails,
  isNegativeOption,
  isPlanApprovalAccepted,
  isPlanApprovalRequest,
  NEGATIVE_OPTION_PATTERN,
  outcomeForSelection,
  readInputString,
  summaryRepeatsSubject,
} from "@/shared/runtimeRequestForms";
export type { OpenCodePermissionDetails } from "@/shared/runtimeRequestForms";

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

export function getApprovalDenyOption(request: OpenRuntimeRequest): UserInputOption | undefined {
  return findApprovalDenyOption(request, getDefaultApprovalOptions());
}
