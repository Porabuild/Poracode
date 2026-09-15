import { useLingui } from "@lingui/react/macro";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { GitReviewPanel } from "./parts/GitReviewPanel";
import type { GitReviewOverlayProps } from "./GitReviewOverlay";

/** Full-screen Git review used by the compact PWA instead of a desktop dock. */
export function CompactGitReviewOverlay(props: GitReviewOverlayProps) {
  const { t } = useLingui();

  return (
    <PageLayout
      title={t`Git Review`}
      compactTitle={t`Git Review`}
      onCompactBack={props.onClose}
      sidebar={<></>}
      content={
        <GitReviewPanel
          project={props.project}
          {...(props.locationOverride ? { locationOverride: props.locationOverride } : {})}
          {...(props.statusKey ? { statusKey: props.statusKey } : {})}
          {...(props.worktreeBranch ? { worktreeBranch: props.worktreeBranch } : {})}
          {...(props.worktreePath ? { worktreePath: props.worktreePath } : {})}
          {...(props.onMergeAndRemove ? { onMergeAndRemove: props.onMergeAndRemove } : {})}
          onExpandToOverlay={() => undefined}
          onClose={props.onClose}
          hideHeader
          hideToolbar
          touchMode
          compactHeaderActions
        />
      }
    />
  );
}
