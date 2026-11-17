import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Link, Popover } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ForgeRepository, PrCheck } from "@/shared/contracts";
import { PrCheckStatusText } from "@/renderer/components/common";
import { usePrChecksEta } from "@/renderer/hooks/usePrChecksEta";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { formatEstimatedClockTime, formatEstimatedRemaining } from "@/renderer/utils/prCheckEta";
import {
  PR_CHECK_TONE_TEXT_CLASS,
  sortPrChecksForDisplay,
  summarizePrChecks,
  type PrChecksSummary,
} from "@/renderer/utils/prStatus";

const HOVER_OPEN_DELAY_MS = 150;
const HOVER_CLOSE_DELAY_MS = 150;

function clearTimerRef(ref: { current: ReturnType<typeof setTimeout> | null }): void {
  if (ref.current !== null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

const TONE_DOT_BG_CLASS = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  neutral: "bg-muted/60",
} as const;

function ChecksProgressRing(props: { summary: PrChecksSummary }) {
  const { summary } = props;
  const radius = 5.5;
  const circumference = 2 * Math.PI * radius;
  const fillRatio =
    summary.progress === null
      ? 0
      : summary.active > 0 && summary.completed === 0
        ? 0.08
        : summary.progress;
  const dashLength = fillRatio * circumference;
  const isCompleteSuccess = summary.total > 0 && summary.active === 0 && summary.tone === "success";
  const isCompleteDanger = summary.total > 0 && summary.active === 0 && summary.tone === "danger";

  return (
    <svg
      className={`size-4 shrink-0 ${PR_CHECK_TONE_TEXT_CLASS[summary.tone]}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="color-mix(in oklab, var(--foreground) 18%, transparent)"
        strokeWidth="1.75"
      />
      {fillRatio > 0 ? (
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray={`${dashLength} ${circumference}`}
          transform="rotate(-90 8 8)"
          className="transition-[stroke-dasharray] duration-300 ease-out"
        />
      ) : null}
      {isCompleteSuccess ? (
        <path
          d="M5.75 8.15L7.3 9.65L10.35 6.45"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {isCompleteDanger ? (
        <path
          d="M6.25 6.25L9.75 9.75M9.75 6.25L6.25 9.75"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

export function PrChecksIndicator(props: {
  checks: readonly PrCheck[];
  projectId: string;
  source?: ForgeRepository | undefined;
}) {
  const { checks, projectId, source } = props;
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const summary = summarizePrChecks(checks);
  const { estimate } = usePrChecksEta({ projectId, checks, source });
  const sortedChecks = sortPrChecksForDisplay(checks);

  const clearTimers = () => {
    clearTimerRef(openTimerRef);
    clearTimerRef(closeTimerRef);
  };

  useEffect(
    () => () => {
      clearTimerRef(openTimerRef);
      clearTimerRef(closeTimerRef);
    },
    [],
  );

  const handleMouseEnterTrigger = () => {
    clearTimerRef(closeTimerRef);
    if (isOpen || openTimerRef.current !== null) return;
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      setIsOpen(true);
    }, HOVER_OPEN_DELAY_MS);
  };

  const handleMouseLeave = () => {
    clearTimerRef(openTimerRef);
    clearTimerRef(closeTimerRef);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  };

  const handleMouseEnterContent = () => {
    clearTimerRef(closeTimerRef);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    clearTimers();
    setIsOpen(nextOpen);
  };

  const endTimeText =
    estimate && !estimate.overdue ? formatEstimatedClockTime(estimate.estimatedEndMs) : undefined;
  const remainingText =
    estimate && !estimate.overdue ? formatEstimatedRemaining(estimate.remainingMs) : undefined;

  const triggerAriaLabel =
    summary.total === 0
      ? t`Checks: none reported`
      : summary.relevantTotal === 0
        ? t`Checks: ${summary.skipped} skipped`
        : summary.active > 0 && endTimeText
          ? t`Checks: ${summary.passed} of ${summary.relevantTotal} passed, estimated end ${endTimeText}`
          : summary.failed > 0
            ? t`Checks: ${summary.passed} of ${summary.relevantTotal} passed, ${summary.failed} failed`
            : t`Checks: ${summary.passed} of ${summary.relevantTotal} passed`;

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label={triggerAriaLabel}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-0.5 py-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
          onMouseEnter={handleMouseEnterTrigger}
          onMouseLeave={handleMouseLeave}
        >
          <ChecksProgressRing summary={summary} />
          {remainingText ? (
            <span className="text-[11px] leading-none text-muted tabular-nums">
              ~{remainingText}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Content placement="top" isNonModal className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <Popover.Dialog
          aria-label={t`PR checks`}
          className="flex flex-col overflow-hidden !p-0 text-xs"
        >
          <div
            className="flex flex-col overflow-hidden"
            onMouseEnter={handleMouseEnterContent}
            onMouseLeave={handleMouseLeave}
          >
            <div className="border-b border-[var(--hairline)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${TONE_DOT_BG_CLASS[summary.tone]}`}
                    aria-hidden
                  />
                  {summary.total === 0 ? (
                    <span className="font-medium text-foreground">
                      <Trans>Checks</Trans>
                    </span>
                  ) : summary.relevantTotal === 0 ? (
                    <>
                      <span className="font-medium text-foreground">
                        <Trans>Checks</Trans>
                      </span>
                      <span className="text-muted tabular-nums">
                        <Trans>{summary.skipped} skipped</Trans>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">
                        <Trans>Checks</Trans>:
                      </span>
                      <span className="font-medium text-foreground tabular-nums">
                        {summary.passed}/{summary.relevantTotal}
                      </span>
                      {summary.failed > 0 ? (
                        <span className="text-danger tabular-nums">
                          · <Trans>{summary.failed} failed</Trans>
                        </span>
                      ) : null}
                      {summary.skipped > 0 ? (
                        <span className="text-muted tabular-nums">
                          · <Trans>{summary.skipped} skipped</Trans>
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
                {summary.progress !== null ? (
                  <span
                    className={`shrink-0 text-[11px] font-medium tabular-nums ${PR_CHECK_TONE_TEXT_CLASS[summary.tone]}`}
                  >
                    {Math.round(summary.progress * 100)}%
                  </span>
                ) : null}
              </div>
              {summary.active > 0 && estimate !== null ? (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted tabular-nums">
                  <Clock className="size-3 shrink-0" aria-hidden />
                  {estimate.overdue ? (
                    <span className="text-warning">
                      <Trans>Taking longer than average</Trans>
                    </span>
                  ) : (
                    <span>
                      <Trans>
                        Est. end {endTimeText} (~{remainingText} left)
                      </Trans>
                    </span>
                  )}
                </div>
              ) : null}
            </div>
            <div className="max-h-[min(18rem,55vh)] overflow-y-auto px-3 py-2">
              {summary.total === 0 ? (
                <p className="text-xs text-muted">
                  <Trans>No checks reported for this PR.</Trans>
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sortedChecks.map((check, index) => (
                    <li
                      key={`${check.name}-${index}`}
                      className="flex items-center justify-between gap-3"
                    >
                      {check.url ? (
                        <Link
                          className="min-w-0 truncate text-xs text-foreground no-underline hover:underline"
                          onPress={() => openExternalWithFeedback(check.url!)}
                        >
                          {check.name}
                        </Link>
                      ) : (
                        <span className="min-w-0 truncate text-foreground">{check.name}</span>
                      )}
                      <PrCheckStatusText check={check} className="shrink-0 text-[11px]" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
