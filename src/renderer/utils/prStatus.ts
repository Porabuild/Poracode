import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { PR_CHECK_FAILURE_CONCLUSIONS, type PrCheck, type PrState } from "@/shared/contracts";
import { formatElapsed } from "@/renderer/utils/formatTime";

export type PrStatusTone = "merged" | "draft" | "danger" | "warning" | "success";
export type PrChecksStatus = "FAILURE" | "PENDING" | "SUCCESS";
export type PrChecksTone = "danger" | "warning" | "success";
export type PrCheckTone = PrChecksTone | "neutral";
export type PrCheckDisplayStatus =
  | "passed"
  | "failed"
  | "running"
  | "pending"
  | "cancelled"
  | "skipped"
  | "neutral"
  | "completed"
  | "unknown";

export const PR_CHECK_STATUS_LABEL: Record<PrCheckDisplayStatus, MessageDescriptor> = {
  passed: msg`Passed`,
  failed: msg`Failed`,
  running: msg`Running`,
  pending: msg`Pending`,
  cancelled: msg`Cancelled`,
  skipped: msg`Skipped`,
  neutral: msg`Neutral`,
  completed: msg`Completed`,
  unknown: msg`Unknown`,
};

export const PR_CHECK_TONE_TEXT_CLASS: Record<PrCheckTone, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  neutral: "text-muted/70",
};

export function getPrCheckPresentation(check: PrCheck): {
  status: PrCheckDisplayStatus;
  tone: PrCheckTone;
} {
  const conclusion = check.conclusion.toUpperCase();
  const state = check.state.toUpperCase();
  const value = conclusion || state;

  if (value === "SUCCESS") return { status: "passed", tone: "success" };
  if (value === "IN_PROGRESS") return { status: "running", tone: "warning" };
  if (
    value === "PENDING" ||
    value === "QUEUED" ||
    value === "EXPECTED" ||
    value === "WAITING" ||
    value === "REQUESTED"
  ) {
    return { status: "pending", tone: "warning" };
  }
  if (value === "CANCELLED" || value === "CANCELED" || value === "STALE") {
    return { status: "cancelled", tone: "danger" };
  }
  if (value === "SKIPPED") return { status: "skipped", tone: "neutral" };
  if (value === "NEUTRAL") return { status: "neutral", tone: "neutral" };
  if (PR_CHECK_FAILURE_CONCLUSIONS.has(value) || value === "ERROR") {
    return { status: "failed", tone: "danger" };
  }
  if (value === "COMPLETED") return { status: "completed", tone: "neutral" };
  return { status: "unknown", tone: "neutral" };
}

export function countPassedPrChecks(checks: readonly PrCheck[]): number {
  return checks.filter((check) => getPrCheckPresentation(check).tone === "success").length;
}

export function isPrCheckActive(check: PrCheck): boolean {
  const status = getPrCheckPresentation(check).status;
  return status === "running" || status === "pending";
}

export function isPrActive(state: PrState | null | undefined): boolean {
  return state === "open" || state === "draft";
}

export function formatPrCheckDuration(check: PrCheck, now = Date.now()): string | undefined {
  if (!check.startedAt) return undefined;
  const startedAt = Date.parse(check.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return undefined;

  const completedAt = check.completedAt ? Date.parse(check.completedAt) : undefined;
  const endedAt =
    completedAt !== undefined && Number.isFinite(completedAt)
      ? completedAt
      : isPrCheckActive(check)
        ? now
        : undefined;
  if (endedAt === undefined || endedAt < startedAt) return undefined;

  const totalSeconds = Math.round((endedAt - startedAt) / 1000);
  if (totalSeconds < 1) return "<1s";
  return formatElapsed(totalSeconds);
}

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
  merged: "bg-[var(--pr-merged)]",
  draft: "bg-gray-400",
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
};

export const PR_TONE_TEXT_CLASS: Record<PrStatusTone, string> = {
  merged: "text-[color:var(--pr-merged)]",
  draft: "text-gray-400",
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
};
