import type { ComponentType } from "react";
import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { usePrMergeReadiness } from "@/renderer/hooks/usePrMergeReadiness";
import { usePrDetailScope } from "../prDetailScope";

export type PrStateAction = "close" | "reopen" | "draft" | "ready";

export interface PrStateItem {
  id: PrStateAction;
  label: string;
  danger?: boolean;
}

/**
 * The review's state and the state changes the host allows from it (close, reopen,
 * back to draft, ready for review). Shared by the desktop state pill and the
 * compact header menu so both offer the same changes.
 */
export function usePrStateChange() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const { actions } = scope;
  const { state, tone, statusLabel, capabilities } = usePrMergeReadiness(
    scope.prKey,
    scope.cacheKey,
  );
  const Icon: ComponentType<{ className?: string }> =
    state === "merged"
      ? GitMerge
      : state === "closed"
        ? GitPullRequestClosed
        : state === "draft"
          ? GitPullRequestDraft
          : GitPullRequest;
  const items: PrStateItem[] = [];
  if (state === "open") {
    if (capabilities?.convertToDraft) items.push({ id: "draft", label: t`Convert to draft` });
    items.push({ id: "close", label: t`Close pull request`, danger: true });
  } else if (state === "draft") {
    if (capabilities?.draft !== false) items.push({ id: "ready", label: t`Ready for review` });
    items.push({ id: "close", label: t`Close pull request`, danger: true });
  } else if (state === "closed") {
    items.push({ id: "reopen", label: t`Reopen pull request` });
  }
  function run(id: PrStateAction) {
    if (id === "close") void actions.handleClosePr();
    else if (id === "reopen") void actions.handleReopenPr();
    else if (id === "draft") void actions.handleConvertPrToDraft();
    else void actions.handleMarkPrReady();
  }
  return {
    state,
    tone,
    statusLabel,
    Icon,
    items,
    run,
    /** State changes are offered only to a writable review. */
    canChange: items.length > 0 && !scope.readOnly,
    busy: actions.prLoading,
  };
}
