import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrDetailNav } from "../detail/prDetailNav";
import { usePrDetailScope } from "../detail/prDetailScope";
import { RailSection } from "./RailSection";

/** Size of the change and a link to the Changes tab, plus how much has been said. */
export function RailChanges() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const { setTab } = usePrDetailNav();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  if (!details) return null;
  const commentCount =
    details.comments.length +
    (details.reviewThreads ?? []).reduce((total, thread) => total + thread.comments.length, 0);
  return (
    <RailSection title={<Trans>Changes</Trans>}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span aria-label={t`${details.additions} additions and ${details.deletions} deletions`}>
          <span className="text-success" aria-hidden>
            +{details.additions}
          </span>{" "}
          <span className="text-danger" aria-hidden>
            −{details.deletions}
          </span>
        </span>
        <button
          type="button"
          className="cursor-pointer text-muted underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setTab("changes")}
        >
          <Plural value={details.changedFiles} one="# file" other="# files" />
        </button>
      </div>
      <p className="text-xs text-muted">
        <Plural value={commentCount} one="# comment" other="# comments" />
      </p>
    </RailSection>
  );
}
