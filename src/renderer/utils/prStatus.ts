import { PR_CHECK_FAILURE_CONCLUSIONS, type PrCheck, type PrState } from "@/shared/contracts";

export type PrStatusTone = "merged" | "draft" | "danger" | "warning" | "success";
export type PrChecksStatus = "FAILURE" | "PENDING" | "SUCCESS";
export type PrChecksTone = "danger" | "warning" | "success";

export function aggregatePrChecksStatus(
  checks: readonly PrCheck[] | undefined,
): PrChecksStatus | undefined {
  if (!checks || checks.length === 0) return undefined;
  let hasPending = false;
  for (const check of checks) {
    const conclusion = check.conclusion.toUpperCase();
    const state = check.state.toUpperCase();
    if (PR_CHECK_FAILURE_CONCLUSIONS.has(conclusion) || state === "ERROR" || state === "FAILURE") {
      return "FAILURE";
    }
    if (state && state !== "COMPLETED" && state !== "SUCCESS") {
      hasPending = true;
    }
  }
  return hasPending ? "PENDING" : "SUCCESS";
}

const CHECKS_STATUS_TONE: Record<PrChecksStatus, PrChecksTone> = {
  FAILURE: "danger",
  PENDING: "warning",
  SUCCESS: "success",
};

function normalizeChecksStatus(checksStatus: string | undefined): PrChecksStatus | undefined {
  const status = checksStatus?.toUpperCase();
  if (status === "FAILURE" || status === "ERROR") return "FAILURE";
  if (status === "PENDING") return "PENDING";
  if (status === "SUCCESS") return "SUCCESS";
  return undefined;
}

export function getChecksStatusTone(
  checksStatus: PrChecksStatus | undefined,
): PrChecksTone | undefined {
  return checksStatus ? CHECKS_STATUS_TONE[checksStatus] : undefined;
}

export function combineChecksStatus(
  detailsStatus: string | undefined,
  prStatus: string | undefined,
): PrChecksStatus | undefined {
  const normalizedDetails = normalizeChecksStatus(detailsStatus);
  const normalizedPr = normalizeChecksStatus(prStatus);
  if (normalizedDetails === "PENDING" || normalizedPr === "PENDING") return "PENDING";
  if (normalizedDetails === "FAILURE" || normalizedPr === "FAILURE") return "FAILURE";
  if (normalizedDetails === "SUCCESS" || normalizedPr === "SUCCESS") return "SUCCESS";
  return undefined;
}

export function getPrStatusTone(
  state: PrState | undefined,
  checksStatus: string | undefined,
): PrStatusTone {
  if (state === "merged") return "merged";
  if (state === "draft") return "draft";
  const checksTone = getChecksStatusTone(normalizeChecksStatus(checksStatus));
  if (checksTone) return checksTone;
  return "success";
}

export const PR_TONE_BG_CLASS: Record<PrStatusTone, string> = {
  merged: "bg-purple-400",
  draft: "bg-gray-400",
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
};

export const PR_TONE_TEXT_CLASS: Record<PrStatusTone, string> = {
  merged: "text-purple-400",
  draft: "text-gray-400",
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
};
