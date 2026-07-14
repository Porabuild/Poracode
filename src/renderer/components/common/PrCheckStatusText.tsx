import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { PrCheck } from "@/shared/contracts";
import {
  formatPrCheckDuration,
  getPrCheckPresentation,
  isPrCheckActive,
  PR_CHECK_STATUS_LABEL,
  PR_CHECK_TONE_TEXT_CLASS,
} from "@/renderer/utils/prStatus";

export function PrCheckStatusText(props: { check: PrCheck; className?: string | undefined }) {
  const { check, className } = props;
  const { t } = useLingui();
  const presentation = getPrCheckPresentation(check);
  const isActive = isPrCheckActive(check);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const startedAt = check.startedAt ? Date.parse(check.startedAt) : Number.NaN;
    if (!isActive || !Number.isFinite(startedAt) || startedAt <= 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [check.startedAt, isActive]);

  const duration = formatPrCheckDuration(check, now);

  return (
    <span
      className={`whitespace-nowrap ${PR_CHECK_TONE_TEXT_CLASS[presentation.tone]} ${className ?? ""}`}
    >
      {duration && <span className="text-muted/70 tabular-nums">{duration} · </span>}
      {t(PR_CHECK_STATUS_LABEL[presentation.status])}
    </span>
  );
}
