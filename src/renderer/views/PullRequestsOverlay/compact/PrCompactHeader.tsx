import { useState } from "react";
import { PR_TONE_BG_CLASS } from "@/renderer/utils/prStatus";
import { PrAutomationControl } from "../detail/header/PrAutomationControl";
import { usePrStateChange } from "../detail/header/usePrStateChange";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrTitle } from "@/renderer/state/gitSelectors";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrCompactMenu } from "./PrCompactMenu";

/**
 * The compact page header's content, built like a thread's (`CompactThreadHeader`):
 * the title on one line (truncated) with a quiet second line, and one more button
 * at the trailing edge that holds every action. The shared `MobilePageHeader`
 * supplies the Back chevron. The title is shown here only, not again in the content.
 */
export function PrCompactHeader() {
  const scope = usePrDetailScope();
  const { state, tone, statusLabel } = usePrStateChange();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  const rowTitle = usePrTitle(scope.prKey);
  const title = details?.title || rowTitle || `#${scope.prNumber}`;
  const watchable = state === "open" || state === "draft";
  const [automationOpen, setAutomationOpen] = useState(false);
  const repository = scope.source?.repository;
  return (
    <div className="m-topbar__thread-row">
      <span className="m-topbar__thread">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="m-topbar__title">{title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-muted/70">
            {state ? (
              <span
                role="img"
                aria-label={statusLabel ?? state}
                title={statusLabel ?? state}
                className={`size-1.5 shrink-0 rounded-full ${PR_TONE_BG_CLASS[tone]}`}
              />
            ) : null}
            <span className="truncate">
              {repository ? `${repository} ` : ""}#{scope.prNumber}
            </span>
          </span>
        </span>
      </span>
      <PrCompactMenu {...(watchable ? { onOpenAutomation: () => setAutomationOpen(true) } : {})} />
      {watchable ? (
        <PrAutomationControl sheet={{ open: automationOpen, onOpenChange: setAutomationOpen }} />
      ) : null}
    </div>
  );
}
