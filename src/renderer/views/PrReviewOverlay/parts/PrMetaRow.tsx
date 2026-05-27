import { GitBranch, GitMerge } from "lucide-react";
import { Chip } from "@heroui/react";
import { usePrState } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrCombinedChecksStatus } from "@/renderer/hooks/usePrCombinedChecksStatus";
import { getPrStatusTone, PR_TONE_BG_CLASS, PR_TONE_TEXT_CLASS } from "@/renderer/utils/prStatus";

const STATE_LABEL: Record<NonNullable<ReturnType<typeof usePrState>>, string> = {
  open: "Open",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
};

/** State chip + author + branches + diff stats — used in the content-header bar. */
export function PrMetaRow(props: { prKey: string; cacheKey: string }) {
  const { prKey, cacheKey } = props;
  const state = usePrState(prKey);
  const checksStatus = usePrCombinedChecksStatus(prKey, cacheKey);
  const details = useGitStore((s) => s.prDetails[cacheKey]);

  const tone = getPrStatusTone(state, checksStatus);
  const stateLabel = state ? STATE_LABEL[state] : "—";
  const head = details?.headBranch;
  const base = details?.baseBranch;
  const author = details?.author?.login;

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs leading-none">
      <Chip size="sm" variant="soft" className={`gap-1 ${PR_TONE_TEXT_CLASS[tone]}`}>
        <span className={`size-1.5 rounded-full ${PR_TONE_BG_CLASS[tone]}`} />
        {state === "merged" ? <GitMerge className="size-3" /> : <GitBranch className="size-3" />}
        {stateLabel}
      </Chip>
      {author && (
        <span className="whitespace-nowrap text-muted">
          by <span className="text-foreground">{author}</span>
        </span>
      )}
      {head && base && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <Chip size="sm" variant="soft" className="max-w-40 truncate font-mono text-[11px]">
            {head}
          </Chip>
          <span className="text-muted/60">→</span>
          <Chip size="sm" variant="soft" className="max-w-40 truncate font-mono text-[11px]">
            {base}
          </Chip>
        </span>
      )}
      {details && (
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px]">
          <span className="text-success">+{details.additions}</span>
          <span className="text-danger">−{details.deletions}</span>
          <span className="text-muted/60">· {details.changedFiles} files</span>
        </span>
      )}
    </div>
  );
}
