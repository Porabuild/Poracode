import { CheckCircle2, Clock, ExternalLink, XCircle } from "lucide-react";
import { Link } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { PR_CHECK_FAILURE_CONCLUSIONS, type PrCheck } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";

type CheckTone = "success" | "danger" | "warning" | "neutral";

function getCheckTone(check: PrCheck): CheckTone {
  const conclusion = check.conclusion?.toUpperCase?.() ?? "";
  const state = check.state?.toUpperCase?.() ?? "";
  if (conclusion === "SUCCESS" || state === "SUCCESS") return "success";
  if (PR_CHECK_FAILURE_CONCLUSIONS.has(conclusion) || state === "ERROR" || state === "FAILURE") {
    return "danger";
  }
  if (state === "PENDING" || state === "EXPECTED" || (state && state !== "COMPLETED")) {
    return "warning";
  }
  return "neutral";
}

const TONE_ICON = {
  success: CheckCircle2,
  danger: XCircle,
  warning: Clock,
  neutral: Clock,
} as const;

const TONE_CLASS = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  neutral: "text-muted/70",
} as const;

export function PrChecksTab(props: { cacheKey: string; loading: boolean }) {
  const { cacheKey, loading } = props;
  const { t } = useLingui();
  const details = useGitStore((s) => s.prDetails[cacheKey]);
  const checks = details?.checks;

  if (loading && !details) {
    return (
      <div className="flex h-full items-center justify-center">
        <PixelLoader size="md" />
      </div>
    );
  }

  if (!checks || checks.length === 0) {
    return (
      <div className="px-6 py-6 text-center text-xs text-muted/60">
        <Trans>No checks reported for this PR.</Trans>
      </div>
    );
  }

  const passed = checks.filter((c) => getCheckTone(c) === "success").length;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
        <span>
          <Trans>
            <span className="text-foreground">{passed}</span> of {checks.length} checks passed
          </Trans>
        </span>
      </div>
      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30">
        {checks.map((check, idx) => {
          const tone = getCheckTone(check);
          const Icon = TONE_ICON[tone];
          return (
            <li
              key={`${check.name}-${idx}`}
              className="flex items-center gap-3 px-3 py-2 hover:bg-foreground/[0.03]"
            >
              <Icon className={`size-4 shrink-0 ${TONE_CLASS[tone]}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{check.name}</div>
                {(check.workflowName || check.conclusion || check.state) && (
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    {check.workflowName ? `${check.workflowName} · ` : ""}
                    {check.conclusion || check.state || t`Unknown`}
                  </div>
                )}
              </div>
              {check.url ? (
                <Link
                  aria-label={t`Open check`}
                  className="shrink-0 text-muted hover:text-foreground"
                  onPress={() => void readBridge().openExternal(check.url!)}
                >
                  <ExternalLink className="size-3.5" />
                </Link>
              ) : (
                <span className="size-3.5 shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
